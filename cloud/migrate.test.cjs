const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const {webcrypto} = require("node:crypto");
const code = fs.readFileSync("cloud/migrate.js", "utf8");
const OLD = "https://muratbekqzzy.github.io";
const HOST = "https://lumen-knowledge-sync.noisyagate9.chatgpt.site";
const TYPE = "lumen-library-transfer-v1";
const state = {version: 1, records: {
  root: {id: "root", kind: "root", title: "Knowledge", parent: null},
  n1: {id: "n1", kind: "note", title: "Existing note", body: "My writing", parent: "inbox"}
}, deleted: {}};

function browser(options = {}) {
  const listeners = new Map(), elements = [], timers = [], sent = [], imports = [];
  const store = new Map(Object.entries(options.storage || {}));
  let account = options.user || {id: "user-a", email: "a@example.test"};
  const parent = {postMessage: (data, origin) => sent.push({data, origin})};
  const window = {
    LUMEN_HOSTED: options.hosted !== false, LUMEN_SYNC_URL: HOST,
    parent: options.framed ? parent : null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {listeners.get(type)?.delete(fn)},
    LumenCloud: {
      getUser: () => account,
      importData: async incoming => {
        if (options.importError) throw Error("Import failed");
        imports.push(incoming);
      }
    }
  };
  if (!window.parent) window.parent = window;
  function element(tag) {
    const e = {tag, style: {}, children: [], hidden: false,
      setAttribute(key, value) {this[key] = value},
      append(child) {this.children.push(child); elements.push(child)},
      remove() {this.removed = true}, click() {this.clicked = true}};
    if (tag === "iframe") e.contentWindow = {postMessage: (data, origin) => sent.push({data, origin})};
    return e;
  }
  const document = {
    documentElement: {style: {}}, body: element("body"), createElement: element,
    querySelector: selector => elements.find(e => e.id === selector.slice(1) && !e.removed) || null
  };
  const localStorage = {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)};
  const location = {href: options.url || HOST + "/?from=legacy"};
  vm.runInNewContext(code, {window, document, localStorage, location, URL, Blob,
    crypto: webcrypto, setTimeout: fn => {timers.push(fn); return timers.length}, clearTimeout() {}, Date});
  return {window, document, elements, store, sent, imports, timers,
    frame: () => elements.find(e => e.tag === "iframe"),
    emit: async (type, event) => {
      for (const fn of [...(listeners.get(type) || [])]) await fn(event);
    },
    setUser: user => {account = user}
  };
}
function request(nonce = "12345678-1234-1234-1234-123456789012") {
  return {type: TYPE, action: "request", nonce};
}
function response(b, incoming = state) {
  const nonce = b.sent[0].data.nonce;
  return {type: TYPE, action: "response", nonce, state: incoming};
}

test("legacy bridge transfers only the library to its configured host and direct parent", async () => {
  const b = browser({hosted: false, framed: true, url: OLD + "/lumen/?lumen-transfer=1",
    storage: {"lumen.cloud.data.v1": JSON.stringify(state),
      "lumen.cloud.auth.v1": JSON.stringify({token: "secret", passphrase: "secret-password"})}});
  await b.emit("message", {origin: "https://attacker.test", source: b.window.parent, data: request()});
  await b.emit("message", {origin: HOST, source: {}, data: request()});
  await b.emit("message", {origin: HOST, source: b.window.parent, data: request("bad")});
  assert.equal(b.sent.length, 0);
  await b.emit("message", {origin: HOST, source: b.window.parent, data: request()});
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].origin, HOST);
  assert.deepEqual(JSON.parse(JSON.stringify(b.sent[0].data.state)), state);
  assert(!JSON.stringify(b.sent[0]).includes("secret"));
  await b.emit("message", {origin: HOST, source: b.window.parent, data: request()});
  assert.equal(b.sent.length, 1, "Respond only once to avoid replay");
  assert.equal(b.store.get("lumen.cloud.auth.v1").includes("secret"), true, "Leave old app data untouched");
});

test("hosted import requires exact source, origin, and nonce and records a per-user checkpoint", async () => {
  const b = browser(); b.frame().onload();
  const data = response(b);
  await b.emit("message", {origin: "https://attacker.test", source: b.frame().contentWindow, data});
  await b.emit("message", {origin: OLD, source: {}, data});
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data: {...data, nonce: "wrong"}});
  assert.equal(b.imports.length, 0);
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data});
  assert.equal(b.imports.length, 1);
  assert(b.store.has("lumen.migration.github.v1.user-a"));
  assert(b.frame().removed);
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data});
  assert.equal(b.imports.length, 1);
  await b.emit("lumen-account-ready", {detail: {id: "user-a"}});
  assert.equal(b.elements.filter(e => e.tag === "iframe").length, 1);
});

test("already migrated account never rereads stale legacy notes", () => {
  const b = browser({storage: {"lumen.migration.github.v1.user-a": "2026-11-15T00:00:00Z"}});
  assert.equal(b.frame(), undefined);
});

test("failed import remains retryable on a later visit and retains the original data", async () => {
  const b = browser({importError: true}); b.frame().onload();
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data: response(b)});
  assert(!b.store.has("lumen.migration.github.v1.user-a"));
  assert(b.document.querySelector("#lumen-migration-notice"));
});

test("empty or partitioned storage does not produce a false migration success", async () => {
  const b = browser(); b.frame().onload();
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data: response(b, null)});
  assert.equal(b.imports.length, 0);
  assert(!b.store.has("lumen.migration.github.v1.user-a"));
  const notice = b.document.querySelector("#lumen-migration-notice");
  assert(notice.children[0].textContent.includes("export"));
});

test("switching accounts while transfer is in flight cannot import into the next account", async () => {
  const b = browser(); b.frame().onload(); b.setUser({id: "user-b"});
  await b.emit("message", {origin: OLD, source: b.frame().contentWindow, data: response(b)});
  assert.equal(b.imports.length, 0);
  assert(!b.store.has("lumen.migration.github.v1.user-a"));
  assert(!b.store.has("lumen.migration.github.v1.user-b"));
});

test("old public app keeps notes accessible and offers export alongside the hosted link", () => {
  const b = browser({hosted: false, url: OLD + "/lumen/", storage: {"lumen.cloud.data.v1": JSON.stringify(state)}});
  const notice = b.document.querySelector("#lumen-migration-notice");
  const link = notice.children.find(e => e.tag === "a");
  const button = notice.children.find(e => e.textContent === "Export existing notes");
  assert.equal(link.href, HOST + "/?from=legacy");
  assert(button);
  assert.equal(b.store.get("lumen.cloud.data.v1"), JSON.stringify(state));
});
