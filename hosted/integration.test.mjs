// Exercises the actual browser adapter and Worker handler against real SQLite.
// Authentication headers stand in for Sites' request identity injection only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleSync} from './sync.mjs';

const code = readFileSync(new URL('../cloud/cloud.js', import.meta.url), 'utf8');
const origin = 'https://lumen.example';
const clean = value => JSON.parse(JSON.stringify(value));
class Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this.db;
    return {sql, args: [], bind(...args) {return {...this, args};}, async all() {
      return {results: db.prepare(sql).all(...this.args)};
    }};
  }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map(({sql, args}) => /RETURNING\s+revision/.test(sql)
        ? {results: this.db.prepare(sql).all(...args)}
        : {results: [], meta: this.db.prepare(sql).run(...args)});
      this.db.exec('COMMIT'); return result;
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
}

function server() {
  const DB = new Database(), requests = [];
  let beforeRequest, afterResponse;
  return {
    DB, requests,
    set beforeRequest(value) {beforeRequest = value;},
    set afterResponse(value) {afterResponse = value;},
    async fetch(url, options, account) {
      const headers = new Headers(options.headers || {});
      if (account.id) {headers.set('oai-authenticated-user-id', account.id); headers.set('oai-authenticated-user-email', account.id + '@example.com');}
      if (options.method === 'PUT') headers.set('Origin', origin);
      const req = new Request(new URL(url, origin), {...options, headers});
      if (beforeRequest) await beforeRequest(req);
      const response = await handleSync(req, {DB});
      requests.push({method: req.method, status: response.status});
      if (afterResponse) await afterResponse(req, response);
      return response;
    },
    async cloud(account = 'alice') {
      const headers = {'oai-authenticated-user-id': account};
      return (await handleSync(new Request(origin + '/api/sync', {headers}), {DB})).json();
    },
  };
}

function browser(remote, options = {}) {
  const saved = options.saved || new Map(), hooks = {}, account = {id: options.account || 'alice'};
  const localStorage = {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)), removeItem: key => saved.delete(key)};
  const navigator = {onLine: true}, location = new URL(origin + '/');
  const fakeElement = () => ({style: {}, append() {}, remove() {}, addEventListener() {}, querySelector: () => null});
  const document = {head: {append() {}}, body: {append() {}}, createElement: fakeElement, querySelector: () => null, hidden: false,
    addEventListener(name, fn) {hooks[name] = fn;}, activeElement: {matches: () => false}};
  const window = {LUMEN_HOSTED: true, fetch: (url, init = {}) => remote.fetch(url, init, account),
    addEventListener(name, fn) {hooks[name] = fn;}, dispatchEvent() {}, location, navigator};
  const context = {window, document, navigator, location, localStorage, sessionStorage: localStorage,
    crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, URL, URLSearchParams, FormData,
    AbortController, Event, Blob, console, btoa, atob, setTimeout: () => 0, clearTimeout() {}, setInterval() {}, alert() {}, confirm: () => true};
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../web/markdown.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../web/import.js", import.meta.url), "utf8"), context);
  vm.runInContext(code, context, {filename: 'cloud/cloud.js'});
  return {window, saved, account, navigator, hooks, cloud: window.LumenCloud};
}

async function api(device, method, path, body) {
  const response = await device.window.fetch(origin + path, {method, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw Error(data.detail || response.status);
  return clean(data);
}
async function connect(device) {
  assert.equal(await device.cloud.sync(), true, device.cloud.state.message);
}
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

const preparedLecture = '# Prepared lecture\n\nA complete explanation with [[Control groups]].\n\n```widget\n<div>Self-contained illustration</div>\n```\n\n# Slide explanations\n\n## Slide 1\nAn official prepared explanation.';
const markdownRequest = device => ({text:'---\nsection: Psychology\nmodule: Research Methods\nlecture: Lecture 01 - Design\n---\n\n'+preparedLecture,filename:'lecture-01.md',accountId:device.cloud.activeAccountId});
test('direct practice questions save offline and sync across devices with existing lecture notes intact',async()=>{
 const remote=server(),a=browser(remote),b=browser(remote);await connect(a);
 const lecture=await api(a,'POST','/api/lectures/import-markdown',markdownRequest(a));
 const originalPack=(await api(a,'GET','/api/lectures/'+lecture.id)).generated['study-pack.md'];
 await api(a,'PUT','/api/lectures/'+lecture.id+'/notes',{body:'Existing private notes'});await connect(a);await connect(b);
 b.navigator.onLine=false;await api(b,'POST','/api/lectures/'+lecture.id+'/questions',{q:'Why use a control?',a:'To provide a comparison.',accountId:b.cloud.activeAccountId});
 assert.equal(await b.cloud.sync(),false);b.navigator.onLine=true;await connect(b);await connect(a);
 const synced=await api(a,'GET','/api/lectures/'+lecture.id);assert(synced.my_notes.startsWith('Existing private notes'));assert(synced.my_notes.includes('Why use a control?'));assert.equal(synced.generated['study-pack.md'],originalPack);
});
test('a Markdown-only lecture syncs its complete material and slide explanations across accounts and offline devices',async()=>{
  const remote=server(),a=browser(remote),b=browser(remote),other=browser(remote,{account:'bob'});
  await connect(a);const imported=await api(a,'POST','/api/lectures/import-markdown',markdownRequest(a));await connect(a);await connect(b);await connect(other);
  const lecture=await api(b,'GET','/api/lectures/'+imported.id);assert(lecture.generated_html['study-pack.md'].includes('language-widget'));assert(lecture.slide_explanations_html[0].html.includes('official prepared'));assert(!lecture.meta.source_pdf&&!lecture.meta.segments);
  assert(!other.cloud.exportData().records[imported.id]);b.navigator.onLine=false;await api(b,'PUT','/api/lectures/'+imported.id+'/notes',{body:'Offline note with a question.'});
  b.navigator.onLine=true;await connect(b);await connect(a);assert.equal((await api(a,'GET','/api/lectures/'+imported.id)).my_notes,'Offline note with a question.');
});
test('simultaneous imports of the same Markdown file converge without duplicate lectures or folders',async()=>{
  const remote=server(),a=browser(remote),b=browser(remote);await connect(a);await connect(b);
  const first=await api(a,'POST','/api/lectures/import-markdown',markdownRequest(a)),second=await api(b,'POST','/api/lectures/import-markdown',markdownRequest(b));assert.equal(first.id,second.id);
  await Promise.all([connect(a),connect(b)]);await connect(a);await connect(b);
  const records=Object.values((await remote.cloud()).state.records);for(const kind of ['section','module','lecture'])assert.equal(records.filter(n=>n.kind===kind).length,1);assert(!records.some(n=>n.id.startsWith('conflict_')));assert.deepEqual(clean(a.cloud.exportData()),clean(b.cloud.exportData()));
});

test('actual clients sync notes, hierarchy, lectures, and offline edits through the Worker', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const section = await api(a, 'POST', '/api/containers', {parent_id: 'root', title: 'Learning'});
  const module = await api(a, 'POST', '/api/containers', {parent_id: section.id, title: 'Memory'});
  const note = await api(a, 'POST', '/api/notes', {parent_id: module.id, title: '🧠 Notes', body: '[[Memory]]'});
  const lecture = await api(a, 'POST', '/api/lectures/from-panopto', {parent_id: module.id, title: 'Lecture', segments: [{id: 0, start: 0, end: 2, text: 'Hippocampus'}], generated: {'study-pack.md': '# Study pack'}});
  await connect(a); await connect(b);
  assert.equal((await api(b, 'GET', '/api/notes/' + note.id)).body, '[[Memory]]');
  assert.equal((await api(b, 'GET', '/api/lectures/' + lecture.id)).generated['study-pack.md'], '# Study pack');
  b.navigator.onLine = false;
  await api(b, 'PUT', '/api/notes/' + note.id, {body: 'Written offline'});
  assert.equal(await b.cloud.sync(), false);
  b.navigator.onLine = true;
  await connect(b); await connect(a);
  assert.equal((await api(a, 'GET', '/api/notes/' + note.id)).body, 'Written offline');
  assert.equal((await remote.cloud()).state.records[module.id].parent, section.id);
});

test('actual simultaneous writes retry optimistic conflicts and retain both devices new records', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a); await connect(b);
  const left = await api(a, 'POST', '/api/notes', {title: 'Laptop', body: 'A'});
  const right = await api(b, 'POST', '/api/notes', {title: 'Phone', body: 'B'});
  const both = deferred(); let reads = 0;
  remote.afterResponse = async request => {if (request.method === 'GET' && reads < 2) {reads++; if (reads === 2) both.resolve(); await both.promise;}};
  await Promise.all([connect(a), connect(b)]);
  remote.afterResponse = undefined;
  await connect(a); await connect(b);
  const state = (await remote.cloud()).state;
  assert.equal(state.records[left.id].body, 'A');
  assert.equal(state.records[right.id].body, 'B');
  assert(remote.requests.some(request => request.status === 409));
});

test('same-note concurrent edits converge into exactly one stable conflict copy', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const note = await api(a, 'POST', '/api/notes', {title: 'Draft', body: 'Initial'});
  await connect(a); await connect(b);
  await api(a, 'PUT', '/api/notes/' + note.id, {body: 'Laptop edit'});
  await api(b, 'PUT', '/api/notes/' + note.id, {body: 'Phone edit'});
  await connect(b); await connect(a); await connect(b); await connect(a);
  const records = Object.values((await remote.cloud()).state.records).filter(item => item.kind === 'note');
  assert.equal(records.length, 2);
  assert.deepEqual(new Set(records.map(item => item.body)), new Set(['Laptop edit', 'Phone edit']));
  assert.deepEqual(clean(a.cloud.exportData()), clean(b.cloud.exportData()));
});

test('edits made during a pending upload remain dirty and reach the next confirmed revision', async () => {
  const remote = server(), a = browser(remote);
  await connect(a);
  const note = await api(a, 'POST', '/api/notes', {title: 'Draft', body: 'First'});
  const captured = deferred(), release = deferred(); let waiting = true;
  remote.beforeRequest = async request => {if (request.method === 'PUT' && waiting) {waiting = false; captured.resolve(); await release.promise;}};
  const inFlight = a.cloud.sync(); await captured.promise;
  await api(a, 'PUT', '/api/notes/' + note.id, {body: 'Typed during upload'});
  release.resolve(); assert.equal(await inFlight, true);
  assert.equal(a.cloud.state.pending, true);
  remote.beforeRequest = undefined; await connect(a);
  assert.equal(a.cloud.state.pending, false);
  assert.equal((await remote.cloud()).state.records[note.id].body, 'Typed during upload');
});

test('undo of a synced creation propagates deletion and undo of editing propagates restoration', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const note = await api(a, 'POST', '/api/notes', {title: 'Draft', body: 'Original'});
  await connect(a); await connect(b);
  await api(a, 'PUT', '/api/notes/' + note.id, {body: 'Changed'});
  await connect(a); await api(a, 'POST', '/api/undo'); await connect(a); await connect(b);
  assert.equal((await api(b, 'GET', '/api/notes/' + note.id)).body, 'Original');
  await api(a, 'POST', '/api/undo'); await connect(a); await connect(b);
  assert.equal((await remote.cloud()).state.records[note.id], undefined);
  assert((await remote.cloud()).state.deleted[note.id] > 0);
  await assert.rejects(() => api(b, 'GET', '/api/notes/' + note.id), /Item not found/);
});

test('undo retains unrelated records received from another device after the local action', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const note = await api(a, 'POST', '/api/notes', {title: 'Original', body: 'A'});
  await connect(a); await connect(b);
  await api(a, 'POST', '/api/rename', {id: note.id, title: 'Renamed'}); await connect(a);
  const remoteNote = await api(b, 'POST', '/api/notes', {title: 'Remote new note', body: 'Preserve me'});
  await connect(b); await connect(a);
  await api(a, 'POST', '/api/undo'); await connect(a); await connect(b);
  assert.equal((await api(a, 'GET', '/api/notes/' + note.id)).title, 'Original');
  assert.equal((await api(b, 'GET', '/api/notes/' + remoteNote.id)).body, 'Preserve me');
});

test('Python-export shaped backup with legacy folder IDs imports and reaches another device', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const state = a.cloud.exportData();
  state.records.folder_1b83d8b44c2ac2f0 = {id: 'folder_1b83d8b44c2ac2f0', kind: 'section', parent: 'root', title: 'Psychology', created: 100, updated: 200, icon: '', color: '', type: '', description: '', position: 0};
  state.records.note_83042384722 = {id: 'note_83042384722', kind: 'note', parent: 'folder_1b83d8b44c2ac2f0', title: 'Exported note', body: 'From Python [[Memory]]', author: 'you', created: 100, updated: 200};
  a.cloud.importData(state); await connect(a); await connect(b);
  assert.equal((await api(b, 'GET', '/api/notes/note_83042384722')).body, 'From Python [[Memory]]');
});

test('concurrent valid folder moves repair merge cycles into a server-valid tree', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await connect(a);
  const left = await api(a, 'POST', '/api/containers', {title: 'First', parent_id: 'root'});
  const right = await api(a, 'POST', '/api/containers', {title: 'Second', parent_id: 'root'});
  await connect(a); await connect(b);
  await api(a, 'POST', '/api/move', {id: left.id, parent_id: right.id});
  await api(b, 'POST', '/api/move', {id: right.id, parent_id: left.id});
  await connect(b); await connect(a); await connect(b);
  const state = (await remote.cloud()).state;
  assert(!(state.records[left.id].parent === right.id && state.records[right.id].parent === left.id));
  assert.equal((await api(a, 'GET', '/api/tree')).id, 'root');
});

test('a changed authenticated account starts with its own cloud and does not upload the previous cache', async () => {
  const remote = server(), a = browser(remote);
  await connect(a);
  const note = await api(a, 'POST', '/api/notes', {title: 'Private', body: 'Alice private note'});
  await connect(a);
  a.account.id = 'bob'; await connect(a);
  assert.equal(a.cloud.activeAccountId, 'bob');
  assert.equal((await remote.cloud('bob')).state.records[note.id], undefined);
  assert.equal((await remote.cloud('alice')).state.records[note.id].body, 'Alice private note');
  a.account.id = 'alice'; await connect(a);
  assert.equal((await api(a, 'GET', '/api/notes/' + note.id)).body, 'Alice private note');
});

test('prepared learning materials, safe caption review and rich rendering survive real two-device sync', async () => {
  const remote=server(), a=browser(remote), b=browser(remote);
  await connect(a);
  const lecture=await api(a,'POST','/api/lectures/from-panopto',{title:'Memory',segments:[{id:11,start:0,end:4,text:'Retrieval source'}],generated:{'resources.md':'Reviewed reference'}});
  await api(a,'PUT','/api/lectures/'+lecture.id+'/materials',{kind:'study-pack',body:'# Memory\n\n[[Retrieval]]\n\n```quiz\n{"questions":[{"q":"What?","options":["A","B"],"answer":0}]}\n```'});
  await connect(a);await connect(b);
  let received=await api(b,'GET','/api/lectures/'+lecture.id);
  assert(received.generated_html['study-pack.md'].includes('language-quiz'));
  assert.equal(received.chunks[0].said[0].id,11);
  await api(b,'PUT','/api/lectures/'+lecture.id+'/transcript',{segments:[{id:11,start:0,end:4,text:'Corrected retrieval source'}]});
  await connect(b);await connect(a);
  received=await api(a,'GET','/api/lectures/'+lecture.id);
  assert(received.meta.materials_stale&&received.meta.caption_reviewed);
  assert.equal(received.generated['resources.md'],'Reviewed reference');
  assert(received.generated['study-pack.md'].includes('[[Retrieval]]'));
  assert.equal((await api(a,'GET','/api/search?q=corrected'))[0].id,lecture.id);
});
