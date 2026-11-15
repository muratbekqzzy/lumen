import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleSync} from './sync.mjs';

class D1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    this.failAt = -1;
  }
  prepare(sql) {
    const db = this;
    return {sql, args: [], bind(...args) {return {...this, args};}, async all() {
      return {results: db.sqlite.prepare(sql).all(...this.args)};
    }};
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map((statement, index) => {
        if (index === this.failAt) throw new Error('Injected transaction failure');
        const prepared = this.sqlite.prepare(statement.sql);
        if (/RETURNING\s+revision/.test(statement.sql)) return {results: prepared.all(...statement.args)};
        return {results: [], meta: prepared.run(...statement.args)};
      });
      this.sqlite.exec('COMMIT');
      return out;
    } catch (error) {this.sqlite.exec('ROLLBACK'); throw error;}
  }
}

const library = (body = 'My notes') => ({version: 1, records: {
  ...Object.fromEntries(['root', 'inbox', 'archive'].map(id => [id, {id, kind: id, parent: null, title: id, created: 1, updated: 1}])),
  n_1: {id: 'n_1', kind: 'note', parent: 'inbox', title: 'Lecture', body, created: 1, updated: 2},
}, deleted: {}});

function request(method, user = 'alice', payload, headers = {}) {
  return new Request('https://lumen.example/api/sync', {method, headers: {
    ...(user ? {'oai-authenticated-user-id': user, 'oai-authenticated-user-email': user + '@example.com'} : {}),
    ...(payload === undefined ? {} : {'Content-Type': 'application/json', 'Origin': 'https://lumen.example', 'X-Lumen-User': user}),
    ...headers,
  }, ...(payload === undefined ? {} : {body: typeof payload === 'string' ? payload : JSON.stringify(payload)})});
}

async function get(db, user = 'alice') {
  const response = await handleSync(request('GET', user), {DB: db});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  return response.json();
}
const put = (db, baseRevision, state, user = 'alice', extra = {}) => handleSync(request('PUT', user, {baseRevision, state, userId: user, ...extra}), {DB: db});

test('a new account has an empty cloud library and first upload roundtrips', async () => {
  const db = new D1();
  assert.deepEqual(await get(db), {user: {id: 'alice', email: 'alice@example.com'}, revision: 0, state: null});
  const state = library('Line one\n[[Memory]] and 🧠');
  const response = await put(db, 0, state);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {revision: 1});
  assert.deepEqual((await get(db)).state, state);
});

test('separate devices cannot overwrite a newer revision, including simultaneous first uploads', async () => {
  const db = new D1();
  const [a, b] = await Promise.all([put(db, 0, library('Laptop')), put(db, 0, library('Phone'))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const first = await get(db);
  assert.equal(first.revision, 1);
  assert.equal((await put(db, 0, library('Stale edit'))).status, 409);
  assert.deepEqual(await get(db), first);
  assert.equal((await put(db, 1, library('Merged edit'))).status, 200);
  assert.equal((await get(db)).state.records.n_1.body, 'Merged edit');
  assert.equal(db.sqlite.prepare('SELECT COUNT(DISTINCT revision) AS total FROM lumen_chunks').get().total, 1);
});

test('authenticated accounts have isolated libraries and a stale account tab cannot upload', async () => {
  const db = new D1();
  await put(db, 0, library('Alice secret'));
  assert.equal((await get(db, 'bob')).state, null);
  assert.equal((await put(db, 0, library('Attempted leak'), 'bob', {userId: 'alice'})).status, 403);
  assert.equal((await get(db, 'bob')).state, null);
  assert.equal((await put(db, 0, library('Bob secret'), 'bob')).status, 200);
  assert.equal((await get(db)).state.records.n_1.body, 'Alice secret');
  assert.equal((await get(db, 'bob')).state.records.n_1.body, 'Bob secret');
  const spoof = request('PUT', 'bob', {baseRevision: 1, userId: 'bob', state: library()}, {'X-Lumen-User': 'alice'});
  assert.equal((await handleSync(spoof, {DB: db})).status, 403);
});

test('a failed multi-chunk upload rolls back both head and chunks', async () => {
  const db = new D1();
  await put(db, 0, library('Confirmed'));
  db.failAt = 3;
  const oldError = console.error;
  console.error = () => {};
  try {assert.equal((await put(db, 1, library('x'.repeat(250000)))).status, 503);}
  finally {console.error = oldError;}
  assert.equal((await get(db)).state.records.n_1.body, 'Confirmed');
  assert.equal((await get(db)).revision, 1);
  assert.deepEqual(db.sqlite.prepare('SELECT DISTINCT revision FROM lumen_chunks').all().map(row => row.revision), [1]);
  db.failAt = -1;
  assert.equal((await put(db, 1, library('Retry succeeded'))).status, 200);
});

test('Unicode lecture snapshots span bounded D1 chunks without corrupting characters', async () => {
  const db = new D1(), state = library('🧠 Қазақша 日本語 مرحبا\n'.repeat(18000));
  const response = await put(db, 0, state);
  assert.equal(response.status, 200);
  assert.deepEqual((await get(db)).state, state);
  const rows = db.sqlite.prepare('SELECT length(payload) AS bytes FROM lumen_chunks').all();
  assert(rows.length > 5);
  assert(rows.every(row => row.bytes <= 65536));
});

test('deletion tombstones survive sync and a newer restored record is valid', async () => {
  const db = new D1(), state = library();
  delete state.records.n_1;
  state.deleted.n_1 = 10;
  assert.equal((await put(db, 0, state)).status, 200);
  assert.equal((await get(db)).state.deleted.n_1, 10);
  state.records.n_1 = {...library().records.n_1, updated: 11};
  assert.equal((await put(db, 1, state)).status, 200);
  assert.equal((await get(db)).state.records.n_1.updated, 11);
});

test('anonymous, cross-origin, unsupported-method, and non-JSON writes are rejected', async () => {
  const db = new D1();
  assert.equal((await handleSync(request('GET', null), {DB: db})).status, 401);
  const foreign = request('PUT', 'alice', {baseRevision: 0, state: library(), userId: 'alice'}, {Origin: 'https://attacker.example'});
  assert.equal((await handleSync(foreign, {DB: db})).status, 403);
  assert.equal((await handleSync(request('GET', 'alice', undefined, {'Sec-Fetch-Site': 'cross-site'}), {DB: db})).status, 403);
  const wrongType = request('PUT', 'alice', '{}', {'Content-Type': 'text/plain'});
  assert.equal((await handleSync(wrongType, {DB: db})).status, 415);
  assert.equal((await handleSync(request('POST'), {DB: db})).status, 405);
  assert.equal((await get(db)).state, null);
});

test('invalid JSON, revisions, tree cycles, missing parents, and prototype fields never write', async () => {
  const db = new D1();
  assert.equal((await handleSync(request('PUT', 'alice', '{broken'), {DB: db})).status, 400);
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER, '0'])
    assert.equal((await put(db, value, library())).status, 400);
  const states = [];
  const missing = library(); delete missing.records.root; states.push(missing);
  const orphan = library(); orphan.records.n_1.parent = 'absent'; states.push(orphan);
  const cycle = library(); cycle.records.n_1 = {...cycle.records.n_1, kind: 'module', parent: 'n_1'}; states.push(cycle);
  const mutated = library(); mutated.records.inbox.parent = 'root'; states.push(mutated);
  const identity = library(); identity.userId = 'alice'; states.push(identity);
  const badId = library(); badId.records.n_1.id = 'different'; states.push(badId);
  const poison = JSON.parse(JSON.stringify(library()).replace('"body":"My notes"', '"body":"My notes","__proto__":{"evil":true}')); states.push(poison);
  for (const state of states) assert.equal((await put(db, 0, state)).status, 400);
  assert.equal((await get(db)).state, null);
});

test('oversized uploads are rejected before persistence, with or without Content-Length', async () => {
  const db = new D1(), huge = library('x'.repeat(8 * 1024 * 1024));
  assert.equal((await put(db, 0, huge)).status, 413);
  assert.equal((await handleSync(request('PUT', 'alice', '{}', {'Content-Length': String(9 * 1024 * 1024)}), {DB: db})).status, 413);
  assert.equal((await get(db)).state, null);
});
