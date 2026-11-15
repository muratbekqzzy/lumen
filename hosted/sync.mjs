/* Hosted Lumen sync. Identity and transport security are provided by Sites.
 * Snapshots commit atomically in D1; revision checks prevent lost updates.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 48 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const SYSTEM = new Set(["root", "inbox", "archive"]);
const KINDS = new Set(["root", "inbox", "archive", "section", "module", "note", "lecture"]);
const CONTAINERS = new Set(["root", "inbox", "archive", "section", "module"]);
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

class APIError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Cookie",
    ...extra,
  }});
}

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validTime = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

function safeJSON(value, depth = 0) {
  if (depth > 64) throw new APIError(400, "The library contains too many nested fields.");
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key)) throw new APIError(400, "The library contains an unsupported field.");
    safeJSON(value[key], depth + 1);
  }
}

export function validateState(state) {
  if (!object(state) || state.version !== 1 || !object(state.records) || !object(state.deleted))
    throw new APIError(400, "This is not a supported Lumen library.");
  if (Object.keys(state).some(key => !["version", "records", "deleted"].includes(key)))
    throw new APIError(400, "The library contains unsupported account fields.");
  safeJSON(state);
  const entries = Object.entries(state.records), tombstones = Object.entries(state.deleted);
  if (entries.length > 50000 || tombstones.length > 50000)
    throw new APIError(413, "This library has too many records for automatic sync.");
  for (const [id, stamp] of tombstones) {
    if (!ID.test(id) || SYSTEM.has(id) || !validTime(stamp))
      throw new APIError(400, "The library contains an invalid deleted record.");
  }
  const active = new Map();
  for (const [id, record] of entries) {
    if (!ID.test(id) || !object(record) || record.id !== id || !KINDS.has(record.kind) ||
        typeof record.title !== "string" || record.title.length > 4096 ||
        !validTime(record.created) || !validTime(record.updated))
      throw new APIError(400, "The library contains an invalid record.");
    if (SYSTEM.has(id)) {
      if (record.kind !== id || record.parent !== null)
        throw new APIError(400, "A required library folder has been changed.");
    } else if (SYSTEM.has(record.kind) || typeof record.parent !== "string" || !ID.test(record.parent)) {
      throw new APIError(400, "The library contains an invalid parent folder.");
    }
    if (state.deleted[id] === undefined || record.updated > state.deleted[id]) active.set(id, record);
  }
  for (const id of SYSTEM) if (!active.has(id))
    throw new APIError(400, "A required library folder is missing.");
  const visited = new Set(SYSTEM);
  for (const [id, record] of active) {
    if (visited.has(id)) continue;
    let current = record;
    const chain = new Set();
    while (!visited.has(current.id)) {
      if (chain.has(current.id) || chain.size >= 256)
        throw new APIError(400, "The library contains a folder cycle or is nested too deeply.");
      chain.add(current.id);
      const parent = active.get(current.parent);
      if (!parent || !CONTAINERS.has(parent.kind))
        throw new APIError(400, "The library contains an item without a valid parent folder.");
      current = parent;
    }
    for (const key of chain) visited.add(key);
  }
  return state;
}

async function readBody(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BYTES) throw new APIError(413, "The library is larger than the 8 MiB sync limit. Export a backup.");
  if (!request.body) throw new APIError(400, "A sync request body is required.");
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new APIError(413, "The library is larger than the 8 MiB sync limit. Export a backup.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)); }
  catch { throw new APIError(400, "The sync request is not valid JSON."); }
}

function encodeChunks(state) {
  const data = new TextEncoder().encode(JSON.stringify(state)), chunks = [];
  if (data.byteLength > MAX_BYTES) throw new APIError(413, "The library is larger than the 8 MiB sync limit. Export a backup.");
  for (let offset = 0; offset < data.length; offset += CHUNK_BYTES)
    chunks.push(btoa(String.fromCharCode(...data.subarray(offset, offset + CHUNK_BYTES))));
  return chunks;
}

function decodeChunks(rows) {
  const chunks = rows.map(row => Uint8Array.from(atob(row.payload), char => char.charCodeAt(0)));
  const all = new Uint8Array(chunks.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of chunks) { all.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(all));
}

async function readSnapshot(db, owner) {
  // A single SELECT sees one SQLite snapshot, even when another device commits.
  const result = await db.prepare(`SELECT h.revision, c.part, c.payload
    FROM lumen_heads h LEFT JOIN lumen_chunks c
      ON c.owner = h.owner AND c.revision = h.revision
    WHERE h.owner = ? ORDER BY c.part`).bind(owner).all();
  const rows = result.results;
  if (!rows.length || rows[0].revision === 0) return {revision: 0, state: null};
  if (!rows.length || rows.some((row, index) => row.part !== index || row.payload === null))
    throw new Error("Incomplete stored library");
  return {revision: rows[0].revision, state: decodeChunks(rows)};
}

async function writeSnapshot(db, owner, revision, state) {
  const next = revision + 1, chunks = encodeChunks(state);
  const statements = [db.prepare(`INSERT INTO lumen_heads(owner, revision, updated_at)
    VALUES (?, 0, 0) ON CONFLICT(owner) DO NOTHING`).bind(owner)];
  for (let part = 0; part < chunks.length; part++) statements.push(db.prepare(`
    INSERT INTO lumen_chunks(owner, revision, part, payload)
    SELECT ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM lumen_heads WHERE owner = ? AND revision = ?)
  `).bind(owner, next, part, chunks[part], owner, revision));
  const updateIndex = statements.length;
  statements.push(db.prepare(`UPDATE lumen_heads SET revision = ?, updated_at = ?
    WHERE owner = ? AND revision = ? RETURNING revision`).bind(next, Date.now(), owner, revision));
  statements.push(db.prepare(`DELETE FROM lumen_chunks WHERE owner = ? AND revision <>
    (SELECT revision FROM lumen_heads WHERE owner = ?)`).bind(owner, owner));
  // D1.batch is transactional. Conditional chunk writes and the head swap share
  // the same revision guard, so a stale upload never alters the current snapshot.
  const result = await db.batch(statements);
  if (!result[updateIndex].results?.length)
    throw new APIError(409, "Another device saved changes. Refresh and retry sync.");
  return next;
}

export async function handleSync(request, env) {
  try {
    const owner = request.headers.get("oai-authenticated-user-id");
    if (!owner || owner.length > 512) throw new APIError(401, "Sign in to keep your library synchronized.");
    if (!env.DB) throw new APIError(503, "Sync storage is temporarily unavailable. Your local changes are safe.");
    const origin = request.headers.get("Origin"), site = request.headers.get("Sec-Fetch-Site");
    if ((origin && origin !== new URL(request.url).origin) || site === "cross-site")
      throw new APIError(403, "Cross-origin sync requests are not allowed.");
    if (request.method === "GET") {
      return json({user: {id: owner, email: request.headers.get("oai-authenticated-user-email") || ""},
        ...await readSnapshot(env.DB, owner)});
    }
    if (request.method !== "PUT") return json({detail: "Use GET or PUT for sync."}, 405, {Allow: "GET, PUT"});
    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json"))
      throw new APIError(415, "Sync requests must contain JSON.");
    const body = await readBody(request);
    if (!object(body)) throw new APIError(400, "A sync request object is required.");
    if (body.userId !== owner || (request.headers.has("X-Lumen-User") && request.headers.get("X-Lumen-User") !== owner))
      throw new APIError(403, "Your signed-in account changed. Reload Lumen before syncing.");
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0 || body.baseRevision >= Number.MAX_SAFE_INTEGER)
      throw new APIError(400, "The sync revision is invalid.");
    const state = validateState(body.state);
    return json({revision: await writeSnapshot(env.DB, owner, body.baseRevision, state)});
  } catch (error) {
    if (error instanceof APIError) return json({detail: error.message}, error.status);
    console.error("Lumen sync storage failure", error);
    return json({detail: "Sync is temporarily unavailable. Your changes remain saved on this device."}, 503, {"Retry-After": "5"});
  }
}
