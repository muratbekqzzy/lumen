// Lumen - front end. Plain JS, no build step.
let graphMod = null;
const loadGraph = async () => (graphMod ||= await import("./graph.js"));
let GRAPH = null; // live graph instance on the current page
const $ =(s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("lumen." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("lumen." + k, JSON.stringify(v)); } catch {} },
};

// luminous section colours: they glow as galaxies in the universe
const COLORS = ["#a9c7ff", "#ffd27a", "#ff9fb2", "#8fe3bf", "#c7b3ff", "#7fd6ff", "#ffb38a", "#e6e9ee"];
const EMOJIS = ["", "📚", "🧠", "🩺", "💬", "🎬", "🎨", "🔬", "📐", "📊", "🌍", "✍️", "🎼", "💻", "🕌", "🥐", "🌿", "⚖️", "🧪", "🏛️", "📷", "🗺️", "🧩", "⭐"];
const TYPES = [["", "General"], ["academic", "Academic"], ["language", "Language"], ["creative", "Creative / practical"]];
const ICONS = {
  more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  inbox: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/></svg>',
  archive: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  lecture: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>',
  note: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  graph: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="17" r="2.8"/><path d="M8 8.5l2.6 6M16.6 7.6l-3.2 7M8.3 6.8l7.7-.6"/></svg>',
  ext: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ------------------------------------------------------------------ api
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch(url, opt);
  const data = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) { const msg = data?.error || data?.detail || "Something went wrong"; toast(msg); throw new Error(msg); }
  return data;
}

// ------------------------------------------------------------------ state
let TREE = null;
const NODES = new Map();   // id -> node
const PARENT = new Map();  // id -> parent id
let expanded = new Set(store.get("expanded", []));

async function loadTree() {
  TREE = await api("GET", "/api/tree");
  NODES.clear(); PARENT.clear();
  const walk = (n, parent) => {
    NODES.set(n.id, n);
    if (parent) PARENT.set(n.id, parent);
    (n.children || []).forEach((c) => walk(c, n.id));
  };
  walk(TREE, null);
  walk(TREE.inbox, null);
  walk(TREE.archive, null);
  renderSidebar();
}
const isContainer = (n) => ["section", "module", "inbox", "archive", "root"].includes(n?.kind);
const kids = (n) => n?.children || [];
const inArchive = (id) => { let p = id; while (p) { if (p === "archive") return true; p = PARENT.get(p); } return false; };

// ------------------------------------------------------------------ helpers
function glyph(n, cls = "") {
  if (n.icon) return `<span class="glyph emoji ${cls}">${h(n.icon)}</span>`;
  return `<span class="glyph ${cls}" style="--c:${h(n.color || COLORS[0])}">${h((n.title || "?").trim()[0]?.toUpperCase() || "?")}</span>`;
}
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function fmtDur(sec) { if (!sec) return ""; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
function countDeep(n, kind) { let c = 0; const w = (x) => { kids(x).forEach((k) => { if (k.kind === kind) c++; w(k); }); }; w(n); return c; }
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
const hrefFor = (n) => n.kind === "note" ? `#/note/${n.id}` : n.kind === "lecture" ? `#/lecture/${n.id}` : n.kind === "root" ? "#/" : `#/n/${n.id}`;

let toastTimer;
function toast(msg, undo = false) {
  $(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${h(msg)}</span>${undo ? '<button>Undo</button>' : ""}`;
  document.body.append(t);
  if (undo) t.querySelector("button").onclick = async () => { t.remove(); const r = await api("POST", "/api/undo"); toast(`Undone: ${r.undone}`); await refresh(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), undo ? 7000 : 3500);
}
async function refresh() { await loadTree(); await route(); }
async function act(promise, msg) { await promise; toast(msg, true); await refresh(); }

// ------------------------------------------------------------------ sidebar
// One folder tree: sections › modules › lectures & notes (like Finder or Obsidian's file list).
function rowHTML(n, depth) {
  if (!isContainer(n)) {
    return `<div class="row leaf" data-id="${n.id}" draggable="true" title="${h(n.title)}">
      <span class="leaf-ico">${n.kind === "lecture" ? ICONS.lecture : ICONS.note}</span><span class="label">${h(n.title)}</span>
      <button class="icon-btn more" data-more>${ICONS.more}</button></div>`;
  }
  const sub = kids(n);
  const open = expanded.has(n.id);
  return `<div class="row" data-id="${n.id}" draggable="true" title="${h(n.title)}">
    <span class="twisty ${open ? "open" : ""} ${sub.length ? "" : "none"}" data-twisty>${ICONS.chev}</span>
    ${glyph(n)}<span class="label">${h(n.title)}</span>
    <button class="icon-btn more" data-more>${ICONS.more}</button></div>
    ${sub.length && open ? `<div class="children">${sub.map((c) => rowHTML(c, depth + 1)).join("")}</div>` : ""}`;
}
function renderSidebar() {
  const sections = kids(TREE).filter(isContainer);
  $("#nav-top").innerHTML = `
    <div class="row" data-nav="#/">${ICONS.graph}<span class="label">Universe</span></div>
    <div class="row" data-nav="#/library">${ICONS.home}<span class="label">Library</span></div>
    <div class="row" data-id="inbox" data-nav="#/n/inbox">${ICONS.inbox}<span class="label">Inbox</span><span class="count">${kids(TREE.inbox).length || ""}</span></div>`;
  $("#tree").innerHTML = sections.length ? sections.map((s) => rowHTML(s, 0)).join("")
    : `<div class="empty-hint">No sections yet. Press <b>+</b> to create your first one, for example <i>Arabic</i> or <i>Neuropsychology</i>.</div>`;
  $("#nav-foot").innerHTML = `
    <div class="row" data-id="archive" data-nav="#/n/archive" title="Archive">${ICONS.archive}<span class="label">Archive</span></div>
    <div class="row" data-nav="#/history" title="History">${ICONS.clock}<span class="label">History</span></div>
    <button class="icon-btn" id="theme" title="Light / dark">${ICONS.moon}</button>`;
  $$(".side .row").forEach((r) => {
    r.addEventListener("click", (e) => {
      if (e.target.closest("[data-more]")) { e.stopPropagation(); const n = NODES.get(r.dataset.id); openMenu(e, n); return; }
      if (e.target.closest("[data-twisty]") && r.dataset.id) { toggle(r.dataset.id); return; }
      go(r.dataset.nav || hrefFor(NODES.get(r.dataset.id)));
    });
    if (r.dataset.id && !["inbox", "archive"].includes(r.dataset.id)) dragSource(r, r.dataset.id);
    if (r.dataset.id) dropTarget(r, r.dataset.id, "y");
  });
  $("#theme").onclick = () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    if (next === "dark") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = "light";
    store.set("theme", next);
  };
  markActive();
}
function toggle(id) { expanded.has(id) ? expanded.delete(id) : expanded.add(id); store.set("expanded", [...expanded]); renderSidebar(); }
function markActive() {
  $$(".side .row").forEach((r) => r.classList.toggle("active", Boolean(
    (r.dataset.nav && r.dataset.nav === location.hash) || (r.dataset.nav === "#/" && (location.hash === "" || location.hash === "#/")) ||
    (r.dataset.id && location.hash.endsWith("/" + r.dataset.id)))));
}

// ------------------------------------------------------------------ drag & drop (move + reorder)
let dragId = null;
function dragSource(el, id) {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => { dragId = id; e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setTimeout(() => el.classList.add("dragging"), 0); });
  el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragId = null; clearDrop(); });
}
function clearDrop() { $$(".drop-into,.drop-before,.drop-after").forEach((x) => x.classList.remove("drop-into", "drop-before", "drop-after")); }
function zone(e, el, axis, canInto, canSide) {
  const r = el.getBoundingClientRect();
  const f = axis === "y" ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
  if (canInto && (!canSide || (f > 0.28 && f < 0.72))) return "into";
  if (!canSide) return null;
  return f < 0.5 ? "before" : "after";
}
function canDrop(srcId, targetId, where) {
  const src = NODES.get(srcId), tgt = NODES.get(targetId);
  if (!src || !tgt || srcId === targetId) return false;
  for (let p = targetId; p; p = PARENT.get(p)) if (p === srcId) return false; // into own descendant
  const dest = where === "into" ? tgt : NODES.get(PARENT.get(targetId)) || TREE;
  if (!isContainer(dest) || dest.kind === "archive") return false;
  if (dest.kind === "root" && !isContainer(src)) return false;
  if (dest.kind === "inbox" && isContainer(src)) return false;
  return true;
}
function dropTarget(el, id, axis) {
  const n = NODES.get(id);
  const canInto = isContainer(n);
  const canSide = !["inbox", "archive"].includes(id);
  el.addEventListener("dragover", (e) => {
    if (!dragId) return;
    const where = zone(e, el, axis, canInto, canSide);
    if (!where || !canDrop(dragId, id, where)) return;
    e.preventDefault();
    clearDrop();
    el.classList.add(`drop-${where}`);
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-into", "drop-before", "drop-after"));
  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    const src = dragId || e.dataTransfer.getData("text/plain");
    const where = zone(e, el, axis, canInto, canSide);
    clearDrop();
    if (!src || !where || !canDrop(src, id, where)) return;
    const s = NODES.get(src);
    if (where === "into") {
      if (PARENT.get(src) === id) return;
      await act(api("POST", "/api/move", { id: src, parent_id: id }), `Moved “${s.title}” to “${n.title}”`);
      return;
    }
    const parentId = PARENT.get(id) || "root";
    const siblings = kids(NODES.get(parentId) || TREE).map((c) => c.id).filter((x) => x !== src);
    let idx = siblings.indexOf(id) + (where === "after" ? 1 : 0);
    if ((PARENT.get(src) || "root") === parentId) {
      siblings.splice(idx, 0, src);
      await act(api("POST", "/api/reorder", { parent_id: parentId, ids: siblings }), `Reordered`);
    } else {
      await act(api("POST", "/api/move", { id: src, parent_id: parentId, index: idx }), `Moved “${s.title}”`);
    }
  });
}

// ------------------------------------------------------------------ menus + dialogs
function openMenu(e, n) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "menu";
  const items = [];
  const archived = inArchive(n.id);
  if (archived && PARENT.get(n.id) === "archive") items.push(["Restore", () => act(api("POST", "/api/restore", { id: n.id }), `Restored “${n.title}”`)]);
  else if (!archived) {
    if (["section", "module"].includes(n.kind)) {
      items.push(["New module inside", () => containerDialog({ parent: n })]);
      items.push(["New note here", () => noteDialog(n)]);
      items.push(["Add lecture here", () => lectureDialog(n)]);
      items.push("-");
    }
    if (n.kind === "inbox") { items.push(["New note", () => noteDialog(n)], ["Add lecture", () => lectureDialog(n)]); }
    if (!["inbox", "archive"].includes(n.kind)) {
      items.push(["Rename…", () => renameDialog(n)]);
      if (["section", "module"].includes(n.kind)) items.push(["Icon, colour & type…", () => containerDialog({ node: n })]);
      items.push(["Move to…", () => moveDialog(n)]);
      items.push("-");
      items.push(["Archive", () => archiveDialog(n), "danger"]);
    }
  }
  if (!items.length) return;
  m.innerHTML = items.map((it, i) => it === "-" ? "<hr>" : `<button data-i="${i}" class="${it[2] || ""}">${h(it[0])}</button>`).join("");
  document.body.append(m);
  const x = Math.min(e.clientX, innerWidth - m.offsetWidth - 10), y = Math.min(e.clientY, innerHeight - m.offsetHeight - 10);
  m.style.left = x + "px"; m.style.top = y + "px";
  m.onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; closeMenu(); items[+b.dataset.i][1](); };
  setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
}
function closeMenu() { $(".menu")?.remove(); }

function dialog(html, onSubmit) {
  const s = document.createElement("div");
  s.className = "scrim";
  s.innerHTML = `<form class="dialog">${html}</form>`;
  document.body.append(s);
  const f = s.querySelector("form");
  const close = () => s.remove();
  s.addEventListener("mousedown", (e) => { if (e.target === s) close(); });
  f.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  f.querySelector("[data-cancel]")?.addEventListener("click", close);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]"); if (btn) btn.disabled = true;
    try { if ((await onSubmit(f)) !== false) close(); } catch { if (btn) btn.disabled = false; }
  });
  setTimeout(() => f.querySelector("input,select,textarea")?.focus(), 30);
  return f;
}

function containerDialog({ parent = null, node = null }) {
  const editing = !!node;
  const kind = editing ? node.kind : (!parent || parent.kind === "root" ? "section" : "module");
  let icon = node?.icon || "", color = node?.color || COLORS[(NODES.size + 3) % COLORS.length];
  const f = dialog(`
    <h3>${editing ? `Edit “${h(node.title)}”` : `New ${kind}${parent && parent.kind !== "root" ? ` in “${h(parent.title)}”` : ""}`}</h3>
    ${editing ? "" : `<label>Name</label><input type="text" name="title" required placeholder="${kind === "section" ? "e.g. Neuropsychology" : "e.g. Psychological Research Methods"}">`}
    <label>Icon</label><div class="emojis">${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === icon ? "on" : ""}">${e || "Aa"}</button>`).join("")}</div>
    <label>Colour</label><div class="swatches">${COLORS.map((c) => `<span class="swatch ${c === color ? "on" : ""}" style="--c:${c}" data-c="${c}"></span>`).join("")}</div>
    <label>Type</label><select name="type">${TYPES.map(([v, l]) => `<option value="${v}" ${v === (node?.type || "") ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">${editing ? "Save" : "Create"}</button></div>`,
    async (f) => {
      const type = f.type.value;
      if (editing) await act(api("PATCH", `/api/containers/${node.id}`, { icon, color, type }), "Saved");
      else {
        const r = await api("POST", "/api/containers", { parent_id: parent?.id || "root", title: f.title.value, icon, color, type });
        if (parent) { expanded.add(parent.id); store.set("expanded", [...expanded]); }
        toast(`Created “${r.title}”`, true);
        await loadTree(); go(`#/n/${r.id}`);
      }
    });
  f.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => { icon = b.dataset.e; f.querySelectorAll("[data-e]").forEach((x) => x.classList.toggle("on", x === b)); });
  f.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { color = b.dataset.c; f.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("on", x === b)); });
}
function renameDialog(n) {
  dialog(`<h3>Rename</h3><input type="text" name="title" required value="${h(n.title)}">
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">Rename</button></div>`,
    (f) => act(api("POST", "/api/rename", { id: n.id, title: f.title.value }), `Renamed to “${f.title.value}”`));
}
function archiveDialog(n) {
  const inside = isContainer(n) ? countDeep(n, "lecture") + countDeep(n, "note") + countDeep(n, "module") : 0;
  dialog(`<h3>Archive “${h(n.title)}”?</h3>
    <p>${inside ? `It contains <b>${inside}</b> item${inside > 1 ? "s" : ""}, which move with it. ` : ""}Nothing is deleted: you can restore it from the Archive at any time, or undo straight away.</p>
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">Archive</button></div>`,
    async () => { await act(api("POST", "/api/archive", { id: n.id }), `Archived “${n.title}”`); if (location.hash.includes(n.id)) go("#/"); });
}
function moveDialog(n) {
  let sel = null;
  const container = isContainer(n);
  const opts = [];
  if (container) opts.push({ id: "root", title: "Top level (becomes a section)", depth: 0, glyph: ICONS.home });
  else opts.push({ id: "inbox", title: "Inbox", depth: 0, glyph: ICONS.inbox });
  const walk = (x, d) => kids(x).filter((k) => ["section", "module"].includes(k.kind)).forEach((k) => {
    if (k.id === n.id) return; // not into itself or its children
    opts.push({ id: k.id, title: k.title, depth: d, node: k });
    walk(k, d + 1);
  });
  walk(TREE, 0);
  const cur = PARENT.get(n.id) || "root";
  const f = dialog(`<h3>Move “${h(n.title)}”</h3><div class="picker">${opts.map((o) => `
    <div class="row" data-id="${o.id}" style="padding-left:${10 + o.depth * 18}px">${o.node ? glyph(o.node) : o.glyph}<span class="label">${h(o.title)}</span>${o.id === cur ? '<span class="count">current</span>' : ""}</div>`).join("")}</div>
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary" disabled>Move here</button></div>`,
    async () => { if (!sel || sel === cur) return; const t = opts.find((o) => o.id === sel); await act(api("POST", "/api/move", { id: n.id, parent_id: sel }), `Moved to “${t.title}”`); });
  f.querySelectorAll(".picker .row").forEach((r) => r.onclick = () => {
    sel = r.dataset.id; f.querySelectorAll(".picker .row").forEach((x) => x.classList.toggle("sel", x === r));
    f.querySelector("[type=submit]").disabled = sel === cur;
  });
}
function noteDialog(parent) {
  dialog(`<h3>New note${parent.kind !== "inbox" ? ` in “${h(parent.title)}”` : ""}</h3>
    <label>Title</label><input type="text" name="title" required placeholder="e.g. Key ideas from week 3">
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">Create</button></div>`,
    async (f) => { const r = await api("POST", "/api/notes", { parent_id: parent.id, title: f.title.value, body: "" }); await loadTree(); go(`#/note/${r.id}?edit`); });
}
function lectureDialog(parent) {
  dialog(`<h3>Add a lecture${parent.kind !== "inbox" ? ` to “${h(parent.title)}”` : ""}</h3>
    <p style="font-size:14px;color:var(--muted)">From Panopto, the easiest way is to give the link to Claude in this desktop app, which fetches the recording and slide timings for you. Or upload a recording here.</p>
    <label>Title</label><input type="text" name="title" required placeholder="e.g. Lecture 04 – Data screening">
    <label>Panopto link (optional, for jump-to-moment links)</label><input type="url" name="panopto_url" placeholder="https://…panopto.eu/…">
    <label>Recording (audio or video)</label><input type="file" name="audio" required accept="audio/*,video/*">
    <label>Slides (PDF, optional)</label><input type="file" name="slides" accept="application/pdf">
    <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">Add and transcribe</button></div>`,
    async (f) => {
      const fd = new FormData(f); fd.append("parent_id", parent.id);
      const r = await api("POST", "/api/lectures", fd);
      toast("Transcribing on your Mac. This takes a few minutes.");
      await loadTree(); go(`#/lecture/${r.id}`);
    });
}

// ------------------------------------------------------------------ rich content (maths, charts, interactive explainers)
let plotlyLoading;
function loadPlotly() {
  plotlyLoading ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
  return plotlyLoading;
}
function themeVars() { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(["--ink", "--ink-2", "--muted", "--line", "--panel", "--bg", "--accent", "--mark"].map((k) => [k, cs.getPropertyValue(k).trim()])); }
async function enhance(root) {
  for (const code of $$("pre > code.language-plotly", root)) {
    const pre = code.parentElement;
    let spec; try { spec = JSON.parse(code.textContent); } catch { continue; }
    const box = document.createElement("div"); box.className = "viz";
    box.innerHTML = `<div class="plot"></div>${spec.caption ? `<div class="cap">${h(spec.caption)}</div>` : ""}`;
    pre.replaceWith(box);
    try {
      await loadPlotly();
      const t = themeVars();
      const layout = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: "Inter, sans-serif", color: t["--ink-2"] }, margin: { t: 40, r: 20, b: 50, l: 55 }, ...(spec.layout || {}) };
      window.Plotly.newPlot(box.firstElementChild, spec.data || [], layout, { responsive: true, displaylogo: false });
    } catch { box.firstElementChild.textContent = "Chart library could not load (offline?)."; }
  }
  for (const code of $$("pre > code.language-quiz", root)) renderQuiz(code);
  for (const code of $$("pre > code.language-widget", root)) {
    const pre = code.parentElement;
    const src = code.textContent;
    const hgt = +(src.match(/height:\s*(\d+)/)?.[1] || 440);
    const t = themeVars();
    const base = `<style>:root{${Object.entries(t).map(([k, v]) => `${k}:${v}`).join(";")}}body{margin:0;padding:16px;font:14px/1.5 Inter,-apple-system,sans-serif;color:var(--ink);background:transparent}</style>`;
    const box = document.createElement("div"); box.className = "viz";
    const fr = document.createElement("iframe");
    fr.setAttribute("sandbox", "allow-scripts"); fr.style.height = hgt + "px"; fr.srcdoc = base + src;
    box.append(fr); pre.replaceWith(box);
  }
  if (window.renderMathInElement) {
    renderMathInElement(root, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true }, { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }], throwOnError: false, ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"] });
  } else setTimeout(() => window.renderMathInElement && enhance(root), 400);
}

// "Check my understanding" quizzes: ```quiz {"title": "...", "questions": [{"q": "...", "options": [...], "answer": 0, "why": "..."}]}
function renderQuiz(code) {
  let spec; try { spec = JSON.parse(code.textContent); } catch { return; }
  const qs = spec.questions || [];
  const box = document.createElement("div"); box.className = "quiz";
  let i = 0, score = 0;
  const draw = () => {
    if (i >= qs.length) {
      box.innerHTML = `<div class="quiz-head"><span>${h(spec.title || "Check your understanding")}</span><span>${qs.length}/${qs.length}</span></div>
        <div class="quiz-done"><b>${score} / ${qs.length}</b><span>${score === qs.length ? "Perfect. That's locked in." : score >= qs.length * 0.6 ? "Good. Revisit the ones you missed." : "Worth another pass through this section."}</span></div>
        <button class="btn" data-again>Try again</button>`;
      box.querySelector("[data-again]").onclick = () => { i = 0; score = 0; draw(); };
      return;
    }
    const q = qs[i];
    box.innerHTML = `<div class="quiz-head"><span>${h(spec.title || "Check your understanding")}</span><span>${i + 1}/${qs.length}</span></div>
      <div class="quiz-bar"><i style="width:${(i / qs.length) * 100}%"></i></div>
      <div class="quiz-q">${h(q.q)}</div>
      <div class="quiz-opts">${q.options.map((o, j) => `<button data-j="${j}"><span>${String.fromCharCode(65 + j)}</span>${h(o)}</button>`).join("")}</div>
      <div class="quiz-why" hidden></div>`;
    box.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => {
      const j = +b.dataset.j, ok = j === q.answer;
      if (ok) score++;
      box.querySelectorAll("[data-j]").forEach((x) => { x.disabled = true; x.classList.toggle("right", +x.dataset.j === q.answer); });
      if (!ok) b.classList.add("wrong");
      const why = box.querySelector(".quiz-why"); why.hidden = false;
      why.innerHTML = `<b>${ok ? "Correct." : "Not quite."}</b> ${h(q.why || "")} <button class="btn primary">${i + 1 < qs.length ? "Next" : "See result"}</button>`;
      why.querySelector("button").onclick = () => { i++; draw(); };
      if (window.renderMathInElement) renderMathInElement(why, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
    });
    if (window.renderMathInElement) renderMathInElement(box, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
  };
  draw();
  code.parentElement.replaceWith(box);
}

// ------------------------------------------------------------------ pages
const main = () => $("#main");
function crumbs(list, extra = []) {
  const items = [{ title: "Library", href: "#/library" }, ...list.map((c) => ({ title: c.title, href: c.kind === "lecture" ? `#/lecture/${c.id}` : `#/n/${c.id}` })), ...extra];
  return `<div class="crumbs">${items.map((c, i) => `${i ? '<span class="sep">/</span>' : ""}<a href="${c.href}">${h(c.title)}</a>`).join("")}</div>`;
}

function pageLibrary() {
  const sections = kids(TREE).filter(isContainer);
  const lectures = []; const walk = (n) => kids(n).forEach((k) => { if (k.kind === "lecture") lectures.push(k); walk(k); });
  walk(TREE); walk(TREE.inbox);
  lectures.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const hr = new Date().getHours();
  const greet = hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const notes = countDeep(TREE, "note") + countDeep(TREE.inbox, "note");
  main().innerHTML = `<div class="page">
    <div class="hero"><h1>Library</h1><p>Your sections, modules and lectures, organised your way.</p></div>
    <div class="stats">
      <div class="stat"><b>${sections.length}</b><span>sections</span></div>
      <div class="stat"><b>${countDeep(TREE, "module")}</b><span>modules</span></div>
      <div class="stat"><b>${lectures.length}</b><span>lectures</span></div>
      <div class="stat"><b>${notes}</b><span>notes</span></div>
    </div>
    ${kids(TREE.inbox).length ? `<h2 class="sec">Waiting in your Inbox <small>drag these into a module, or use ⋯ → Move to…</small></h2><div class="grid" id="inbox-grid">${kids(TREE.inbox).map(cardHTML).join("")}</div>` : ""}
    <h2 class="sec">Sections</h2>
    ${sections.length ? `<div class="grid" id="sec-grid">${sections.map(cardHTML).join("")}</div>`
      : `<div class="empty"><h3>Start with your first section</h3><p>Sections are your big areas, such as Arabic, Neuropsychology or Filmmaking. Inside each one you add modules.</p><button class="btn primary" id="first-sec">${ICONS.plus} New section</button></div>`}
    ${lectures.length ? `<h2 class="sec">Recent lectures</h2><div class="list">${lectures.slice(0, 6).map(itemHTML).join("")}</div>` : ""}
  </div>`;
  $("#first-sec")?.addEventListener("click", () => containerDialog({}));
  wireItems(main());
}

// ---- graph
const KIND_LABEL = { section: "Section", module: "Module", lecture: "Lecture", note: "Note", concept: "Concept" };
async function pageGraph() {
  const hr = new Date().getHours();
  const greet = hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const lectures = []; const walk = (n) => kids(n).forEach((k) => { if (k.kind === "lecture") lectures.push(k); walk(k); });
  walk(TREE); walk(TREE.inbox);
  lectures.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const inbox = kids(TREE.inbox).length;
  main().innerHTML = `<div class="graph-page space">
    <div class="graph-host" id="ghost"></div>
    <div class="graph-ui">
      <div class="graph-title"><h1>${greet}.</h1><p id="gstats"></p></div>
      <div class="graph-tools">
        <input id="gq" type="search" placeholder="Find a star" autocomplete="off">
        <button class="pill on" data-f="structure">Structure</button>
        <button class="pill on" data-f="concepts">Concepts</button>
        <button class="pill" id="gfit" title="Fit to screen">Fit</button>
      </div>
    </div>
    <aside class="graph-panel" id="gpanel" hidden></aside>
    <div class="u-dock">
      ${lectures[0] ? `<a class="u-card" href="#/lecture/${lectures[0].id}"><small>Continue</small><b>${h(lectures[0].title)}</b><span>${h([lectures[0].lecturer, fmtDur(lectures[0].duration)].filter(Boolean).join(" · "))}</span></a>` : ""}
      ${inbox ? `<a class="u-card" href="#/n/inbox"><small>Inbox</small><b>${inbox} item${inbox > 1 ? "s" : ""} to file</b><span>Drag into a section in the sidebar</span></a>` : ""}
      ${!kids(TREE).filter(isContainer).length ? `<a class="u-card" href="#/library" id="u-first"><small>Begin</small><b>Create your first section</b><span>Each section becomes its own galaxy</span></a>` : ""}
    </div>
  </div>`;
  $("#u-first")?.addEventListener("click", (e) => { e.preventDefault(); containerDialog({}); });
  const [g, data] = await Promise.all([loadGraph(), api("GET", "/api/graph")]);
  const counts = data.nodes.reduce((a, n) => (a[n.kind] = (a[n.kind] || 0) + 1, a), {});
  $("#gstats").textContent = [["section", "sections"], ["module", "modules"], ["lecture", "lectures"], ["note", "notes"], ["concept", "concepts"]].filter(([k]) => counts[k]).map(([k, p]) => `${counts[k]} ${counts[k] === 1 ? p.slice(0, -1) : p}`).concat(`${data.edges.length} link${data.edges.length === 1 ? "" : "s"}`).filter(Boolean).join("  ·  ");
  if (!data.nodes.length) { $("#ghost").innerHTML = `<div class="empty" style="margin:120px auto;max-width:420px"><h3>Nothing to connect yet</h3><p>Add sections, lectures and notes. Concepts written as [[Concept]] link everything together.</p></div>`; return; }
  const open = (n) => {
    if (!n) return;
    if (n.kind === "concept") go(`#/concept/${encodeURIComponent(n.title)}`);
    else go(hrefFor(n));
  };
  GRAPH = g.mountGraph($("#ghost"), data, {
    onOpen: open,
    onSelect: (n, nb) => {
      const p = $("#gpanel");
      if (!n) { p.hidden = true; return; }
      $("#ghint")?.remove();
      p.hidden = false;
      p.innerHTML = `<div class="gp-k"><span class="dot" style="--c:${h(n.kind === "concept" ? (n.bridges > 1 ? "#ffd27a" : "var(--muted)") : n.color || "var(--accent)")}"></span>${KIND_LABEL[n.kind] || n.kind}${n.bridges > 1 ? " · bridges " + n.bridges + " sections" : ""}</div>
        <div class="gp-t">${h(n.title)}</div>
        <div class="gp-m">${nb.length} connection${nb.length === 1 ? "" : "s"}</div>
        <div class="gp-list">${nb.sort((a, b) => (a.kind === "concept") - (b.kind === "concept") || a.title.localeCompare(b.title)).slice(0, 40).map((x) => `<button data-id="${h(x.id)}"><span class="dot" style="--c:${h(x.kind === "concept" ? "var(--muted)" : x.color || "var(--accent)")}"></span>${h(x.title)}</button>`).join("")}</div>
        <button class="btn primary gp-open">Open ${KIND_LABEL[n.kind]?.toLowerCase() || ""}</button>`;
      p.querySelector(".gp-open").onclick = () => open(n);
      p.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => GRAPH.focus(b.dataset.id));
    },
  });
  $$(".graph-tools [data-f]").forEach((b) => b.onclick = () => { b.classList.toggle("on"); GRAPH.setFilter({ [b.dataset.f]: b.classList.contains("on") }); });
  $("#gfit").onclick = () => { GRAPH.clear(); GRAPH.fit(); };
  $("#gq").addEventListener("input", (e) => GRAPH.setQuery(e.target.value.trim()));
  $("#gq").addEventListener("keydown", (e) => { if (e.key === "Enter") { const n = data.nodes.find((x) => x.title.toLowerCase().includes(e.target.value.trim().toLowerCase())); if (n) GRAPH.focus(n.id); } });
}

async function pageConcept(name) {
  const c = await api("GET", `/api/concept/${encodeURIComponent(name)}`);
  main().innerHTML = `<div class="page">${crumbs([], [{ title: "Universe", href: "#/" }])}
    <h1 class="title"><span class="concept-mark"></span>${h(c.name)}</h1>
    <div class="sub"><span class="chip">Concept</span><span>Mentioned in ${c.mentions.length} place${c.mentions.length === 1 ? "" : "s"}</span></div>
    <div class="local-graph" id="lg"></div>
    <div class="results">${c.mentions.map((m, i) => `<div class="r" data-i="${i}"><div class="rt">${h(m.title)}</div>
      <div class="rp">${h(m.place || "Inbox")}${m.part && m.part !== "note" ? " · " + h(m.part.replace(/^Generated\//, "").replace(/\.md$/, "").replace(/-/g, " ")) : ""}</div><div class="rs">${m.snippet_html}</div></div>`).join("")
      || `<div class="empty"><h3>No mentions yet</h3></div>`}</div></div>`;
  $$(".results .r").forEach((el) => el.onclick = (e) => {
    if (e.target.closest("a")) return;
    const m = c.mentions[+el.dataset.i];
    go(m.kind === "lecture" ? `#/lecture/${m.id}/${m.part.startsWith("My Notes") ? "notes" : "pack"}` : m.kind === "note" ? `#/note/${m.id}` : `#/n/${m.id}`);
  });
  const [g, data] = await Promise.all([loadGraph(), api("GET", "/api/graph")]);
  const me = data.nodes.find((n) => n.kind === "concept" && n.title.toLowerCase() === c.name.toLowerCase()) || data.nodes.find((n) => n.title.toLowerCase() === c.name.toLowerCase());
  if (!me) { $("#lg").remove(); return; }
  // local neighbourhood: the concept, what mentions it, and their other concepts
  const keep = new Set([me.id]);
  data.edges.forEach((e) => { if (e.source === me.id) keep.add(e.target); if (e.target === me.id) keep.add(e.source); });
  const first = new Set(keep);
  data.edges.forEach((e) => { if (first.has(e.source) && e.source !== me.id && keep.size < 60) keep.add(e.target); });
  const sub = { nodes: data.nodes.filter((n) => keep.has(n.id)), edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  GRAPH = g.mountGraph($("#lg"), sub, { focusId: me.id, onOpen: (n) => n && (n.kind === "concept" ? go(`#/concept/${encodeURIComponent(n.title)}`) : go(hrefFor(n))), onSelect: () => {} });
}

function cardHTML(n) {
  const k = n.kind;
  let meta = "";
  if (k === "section" || k === "module") {
    const m = kids(n).filter((x) => x.kind === "module").length, l = countDeep(n, "lecture"), no = countDeep(n, "note");
    meta = [m && `${m} module${m > 1 ? "s" : ""}`, l && `${l} lecture${l > 1 ? "s" : ""}`, no && `${no} note${no > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "Empty";
  } else if (k === "lecture") meta = [n.lecturer, fmtDur(n.duration), statusLabel(n)].filter(Boolean).join(" · ");
  else meta = fmtDate(n.updated);
  const label = { section: "Section", module: "Module", lecture: "Lecture", note: "Note" }[k] || k;
  return `<div class="card" data-id="${n.id}" style="--c:${h(n.color || "transparent")}"><span class="bar"></span>
    <div class="k">${isContainer(n) ? glyph(n) : ""}${label}<span style="flex:1"></span><button class="icon-btn more" data-more>${ICONS.more}</button></div>
    <div class="t">${h(n.title)}</div><div class="m">${h(meta)}</div></div>`;
}
function itemHTML(n) {
  const meta = n.kind === "lecture" ? [n.lecturer, fmtDur(n.duration), statusLabel(n)].filter(Boolean).join(" · ") : fmtDate(n.updated);
  return `<div class="item" data-id="${n.id}"><span class="t">${h(n.title)}</span><span class="m">${h(meta)}</span><button class="icon-btn more" data-more>${ICONS.more}</button></div>`;
}
function statusLabel(n) {
  return { processing: "Processing…", queued: "Queued", transcribing: "Transcribing…", transcribed: "Transcribed", complete: "Study pack ready", error: "Error" }[n.status] || "";
}
function wireItems(root, parentId = null) {
  $$(".card[data-id], .item[data-id]", root).forEach((el) => {
    const n = NODES.get(el.dataset.id); if (!n) return;
    el.addEventListener("click", (e) => { if (e.target.closest("[data-more]")) { e.stopPropagation(); openMenu(e, n); return; } go(hrefFor(n)); });
    if (inArchive(n.id)) return;
    dragSource(el, n.id);
    dropTarget(el, n.id, el.classList.contains("item") ? "y" : "x");
  });
}

function pageContainer(id) {
  const n = NODES.get(id);
  if (!n) return pageMissing();
  const archived = n.kind === "archive";
  const subs = kids(n).filter(isContainer), lecs = kids(n).filter((k) => k.kind === "lecture"), notes = kids(n).filter((k) => k.kind === "note");
  const special = ["inbox", "archive"].includes(n.kind);
  const typeLabel = TYPES.find(([v]) => v === n.type)?.[1];
  main().innerHTML = `<div class="page">
    ${crumbs([])}
    <h1 class="title">${special ? (n.kind === "inbox" ? ICONS.inbox : ICONS.archive) : glyph(n)}<span class="${special ? "" : "title-edit"}" id="ttl">${h(n.title)}</span></h1>
    <div class="sub">${special ? (archived ? "Archived items. Nothing here is deleted; restore anything with ⋯ → Restore." : "Unsorted things land here. Drag them into a section or module when you're ready.")
      : `<span class="chip">${n.kind === "section" ? "Section" : "Module"}</span>${typeLabel && n.type ? `<span class="chip">${typeLabel}</span>` : ""}<span>${countDeep(n, "lecture")} lectures · ${countDeep(n, "note")} notes</span>`}</div>
    ${special ? "" : `<div class="desc ${n.description ? "" : "placeholder"}" id="desc">${n.description ? h(n.description) : "Add a short description…"}</div>`}
    ${archived ? "" : `<div class="toolbar">
      ${special ? "" : `<button class="btn" data-a="module">${ICONS.plus} Module</button>`}
      <button class="btn" data-a="note">${ICONS.plus} Note</button>
      <button class="btn" data-a="lecture">${ICONS.plus} Lecture</button>
      ${special ? "" : `<span style="flex:1"></span><button class="btn ghost" data-a="menu">${ICONS.more}</button>`}</div>`}
    ${subs.length ? `<h2 class="sec">${archived ? "Sections & modules" : "Modules"}</h2><div class="grid">${subs.map(cardHTML).join("")}</div>` : ""}
    ${lecs.length ? `<h2 class="sec">Lectures</h2><div class="grid">${lecs.map(cardHTML).join("")}</div>` : ""}
    ${notes.length ? `<h2 class="sec">Notes</h2><div class="list">${notes.map(itemHTML).join("")}</div>` : ""}
    ${!subs.length && !lecs.length && !notes.length ? `<div class="empty"><h3>Nothing here yet</h3><p>${archived ? "Archived items will appear here." : special ? "New lectures and quick notes arrive here." : "Add a module, a note or a lecture using the buttons above."}</p></div>` : ""}
  </div>`;
  if (!special) api("GET", `/api/node/${id}`).then((d) => { const c = $(".crumbs", main()); if (c) c.outerHTML = crumbs(d.breadcrumbs.slice(0, -1)); }).catch(() => {});
  $$("[data-a]").forEach((b) => b.onclick = (e) => ({ module: () => containerDialog({ parent: n }), note: () => noteDialog(n), lecture: () => lectureDialog(n), menu: () => openMenu(e, n) })[b.dataset.a]());
  if (!special) {
    $("#ttl").onclick = () => renameDialog(n);
    $("#desc").onclick = () => dialog(`<h3>Description</h3><textarea name="d" rows="4">${h(n.description || "")}</textarea>
      <div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary">Save</button></div>`,
      (f) => act(api("PATCH", `/api/containers/${id}`, { description: f.d.value }), "Description saved"));
  }
  wireItems(main(), id);
}

// ---- lecture
let LECTURE = null, poll;
const KNOWN = { "study-pack.md": "Study pack", "flashcards.md": "Flashcards", "resources.md": "Further resources" };
async function pageLecture(id, tab) {
  clearInterval(poll);
  const d = await api("GET", `/api/lectures/${id}`);
  LECTURE = d;
  const m = d.meta;
  const gen = d.generated_html;
  const explainers = Object.keys(gen).filter((k) => k.startsWith("explain"));
  const others = Object.keys(gen).filter((k) => !KNOWN[k] && !k.startsWith("explain"));
  const tabs = [["pack", "Study pack"], ["slides", "Slides & transcript", d.chunks.length], ["cards", "Flashcards"], ["explain", "Explanations", explainers.length || ""],
    ["resources", "Further resources"], ...others.map((k) => ["g:" + k, k.replace(/\.md$/, "").replace(/[-_]/g, " ")]), ["notes", "My notes"]];
  tab = tab || (gen["study-pack.md"] ? "pack" : "slides");
  const busy = ["processing", "queued", "transcribing"].includes(m.status);
  main().innerHTML = `<div class="page" id="lec">
    ${crumbs(d.breadcrumbs.slice(0, -1))}
    <h1 class="title"><span class="title-edit" id="ttl">${h(m.title)}</span></h1>
    <div class="sub">
      ${m.lecturer ? `<span>${h(m.lecturer)}</span>` : ""}${m.date ? `<span>${h(fmtDate(m.date))}</span>` : ""}${m.duration ? `<span>${fmtDur(m.duration)}</span>` : ""}
      ${m.slide_count ? `<span>${m.slide_count} slides</span>` : ""}
      <span class="chip ${m.status === "complete" ? "ok" : busy ? "warn" : ""}">${statusLabel(m) || "New"}</span>
      ${m.panopto_url ? `<a class="btn ghost" href="${h(m.panopto_url)}" target="_blank" rel="noopener">Open in Panopto ${ICONS.ext}</a>` : ""}
      <button class="icon-btn" id="lmore">${ICONS.more}</button>
    </div>
    ${busy ? `<div class="empty"><h3>Transcribing on your Mac…</h3><p>Whisper is listening to the recording. A 45-minute lecture takes roughly 5 to 10 minutes. This page updates itself.</p></div>` : `
    <div class="tabs">${tabs.map(([k, l, c]) => `<button class="tab ${k === tab ? "on" : ""}" data-t="${k}">${h(l)}${c ? `<span class="n">${c}</span>` : ""}</button>`).join("")}</div>
    <div id="tabbody"></div>`}
  </div>${d.has_audio && !busy ? `<div class="player"><audio id="aud" controls preload="metadata" src="/api/lectures/${id}/audio"></audio><span class="now-t" id="nowt"></span></div>` : ""}`;
  $("#ttl").onclick = () => renameDialog(NODES.get(id) || { id, title: m.title });
  $("#lmore").onclick = (e) => openMenu(e, NODES.get(id) || { id, title: m.title, kind: "lecture" });
  if (busy) { poll = setInterval(async () => { const j = await api("GET", "/api/lectures/" + id); if (!["processing", "queued", "transcribing"].includes(j.meta.status)) { clearInterval(poll); await refresh(); } }, 5000); return; }
  $$(".tab").forEach((b) => b.onclick = () => { history.replaceState(null, "", `#/lecture/${id}/${b.dataset.t}`); pageLectureTab(id, b.dataset.t); });
  pageLectureTab(id, tab);
  wireAudio();
}
function emptyAsk(what, prompt) {
  return `<div class="empty"><h3>No ${what} yet</h3><p>Ask any connected AI assistant (Claude or ChatGPT) to create it from this lecture:</p>
    <code>${h(prompt)}</code><br><br><button class="btn" data-copy="${h(prompt)}">Copy prompt</button></div>`;
}
function pageLectureTab(id, tab) {
  $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  const d = LECTURE, gen = d.generated_html, body = $("#tabbody"), t = d.meta.title;
  if (tab === "pack") body.innerHTML = gen["study-pack.md"] ? `<div class="prose">${gen["study-pack.md"]}</div>` : emptyAsk("study pack", `Make the study pack for my lecture “${t}” in Lumen.`);
  else if (tab === "resources") body.innerHTML = gen["resources.md"] ? `<div class="prose">${gen["resources.md"]}</div>` : emptyAsk("further resources", `Find further resources for my lecture “${t}” in Lumen and save them.`);
  else if (tab === "explain") {
    const ks = Object.keys(gen).filter((k) => k.startsWith("explain"));
    body.innerHTML = ks.length ? ks.map((k) => `<div class="prose">${gen[k]}</div><hr>`).join("") : emptyAsk("explanations", `Explain the hardest idea in my lecture “${t}” simply, with an interactive graph, and save it to Lumen.`);
  } else if (tab.startsWith("g:")) body.innerHTML = `<div class="prose">${gen[tab.slice(2)]}</div>`;
  else if (tab === "cards") body.innerHTML = renderCards(d.generated["flashcards.md"]) || emptyAsk("flashcards", `Make flashcards for my lecture “${t}” in Lumen.`);
  else if (tab === "notes") return renderEditor(body, d.my_notes, async (text) => { const r = await api("PUT", `/api/lectures/${id}/notes`, { body: text }); d.my_notes = text; return r.html; }, "Write your own notes. AI assistants can read these but never overwrite them.");
  else if (tab === "slides") renderSlides(body, id);
  $$("[data-copy]", body).forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast("Prompt copied"); });
  $$(".flash-card", body).forEach((c) => c.onclick = () => c.classList.toggle("flip"));
  enhance(body);
}
function renderCards(md) {
  if (!md) return "";
  const cards = []; let cur = null;
  for (const line of md.split("\n")) {
    const q = line.match(/^\s*(?:[-*]\s*)?\**Q:?\**:?\s*(.*)$/i), a = line.match(/^\s*(?:[-*]\s*)?\**A:?\**:?\s*(.*)$/i);
    if (q && /^\s*(?:[-*]\s*)?\**Q/i.test(line)) { cur = { q: q[1], a: "" }; cards.push(cur); }
    else if (a && cur && /^\s*(?:[-*]\s*)?\**A/i.test(line)) cur.a = a[1];
    else if (cur && line.trim() && !line.startsWith("#")) { if (cur.a) cur.a += " " + line.trim(); else cur.q += " " + line.trim(); }
  }
  if (!cards.length) return "";
  return `<p style="color:var(--muted);margin-top:-8px">${cards.length} cards · click a card to flip it. Spaced-repetition review comes in the next stage.</p>
    <div class="cards">${cards.map((c) => `<div class="flash-card"><div class="in"><div class="face front"><small>Question</small><div>${h(c.q)}</div></div><div class="face back"><small>Answer</small><div>${h(c.a)}</div></div></div></div>`).join("")}</div>`;
}
function renderSlides(body, id) {
  const d = LECTURE;
  if (!d.chunks.length) { body.innerHTML = `<div class="empty"><h3>No transcript yet</h3></div>`; return; }
  body.innerHTML = `<p style="color:var(--muted);margin-top:-8px">Each slide sits next to what was said while it was on screen. Click a time or any sentence to listen from that moment${d.meta.panopto_url ? ", or ↗ to open Panopto there" : ""}.</p>
  <div class="slides">${d.chunks.map((c) => `
    <div class="chunk" id="chunk-${c.n}" data-start="${c.start}" data-end="${c.end}">
      <div>${c.page ? `<img loading="lazy" src="/api/lectures/${id}/slides/${c.page}.png" alt="Slide ${c.page}">`
        : `<div class="ghost-slide"><div><b>${h(c.title)}</b>${c.not_in_pdf ? "Shown in the lecture, but not in your PDF slides" : "Before the slides"}</div></div>`}</div>
      <div><div class="head"><span class="t">${c.page ? `<span style="color:var(--muted);font-weight:400">${c.page}.</span> ` : ""}${h(c.title)}</span>
        <button class="time" data-seek="${c.start}">${ICONS.play} ${c.time}</button>${c.link ? `<a class="time" href="${h(c.link)}" target="_blank" rel="noopener" title="Open in Panopto at this moment">↗</a>` : ""}</div>
        <div class="said">${c.said.length ? c.said.map((s) => `<span data-seek="${s.start}" data-s="${s.id}">${h(s.text)}</span> `).join("") : '<span class="none">No speech while this slide was shown.</span>'}</div></div>
    </div>`).join("")}</div>
  ${d.pages_not_shown?.length ? `<h2 class="sec">In your PDF but not shown in the recording</h2><p style="color:var(--muted)">Slides ${d.pages_not_shown.join(", ")}. These were probably merged or skipped in the version presented.</p>
    <div class="grid">${d.pages_not_shown.map((p) => `<a href="/api/lectures/${id}/slides/${p}.png" target="_blank"><img loading="lazy" style="width:100%;border-radius:8px;border:1px solid var(--line)" src="/api/lectures/${id}/slides/${p}.png" alt="Slide ${p}"></a>`).join("")}</div>` : ""}`;
  $$("[data-seek]", body).forEach((b) => b.onclick = () => seek(+b.dataset.seek, b.closest(".chunk")));
  const want = new URLSearchParams(location.hash.split("?")[1] || "").get("chunk");
  if (want) { const el = $("#chunk-" + want); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); } }
}
function seek(t, chunk) {
  const a = $("#aud");
  if (!a) { const c = LECTURE.chunks.find((x) => x.start <= t && t < x.end); if (c?.link) window.open(c.link, "_blank"); return; }
  a.currentTime = t; a.play();
}
function wireAudio() {
  const a = $("#aud"); if (!a) return;
  let last = null;
  a.addEventListener("timeupdate", () => {
    const t = a.currentTime;
    const c = LECTURE.chunks.find((x) => x.start <= t && t < x.end);
    if (c && c.n !== last) {
      last = c.n;
      $$(".chunk.playing").forEach((x) => x.classList.remove("playing"));
      const el = $("#chunk-" + c.n); el?.classList.add("playing");
      if (el && !a.paused) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      $("#nowt").textContent = c.title;
    }
    const seg = c?.said.find((s) => s.start <= t && t < s.end);
    $$(".said span.now").forEach((x) => x.classList.remove("now"));
    if (seg) $(`[data-s="${seg.id}"]`)?.classList.add("now");
  });
}

// ---- notes
function renderEditor(body, text, save, hint) {
  body.innerHTML = `<div class="toolbar"><button class="btn primary" id="save">Save</button><span style="color:var(--muted);font-size:13px;align-self:center">${h(hint || "Markdown supported. ⌘S to save.")}</span></div>
    <div class="editor"><textarea id="ed" spellcheck="true">${h(text)}</textarea><div class="preview prose" id="pv"></div></div>`;
  const ed = $("#ed"), pv = $("#pv");
  let t;
  const preview = async () => { pv.innerHTML = await api("POST", "/api/render", { body: ed.value }); enhance(pv); };
  ed.addEventListener("input", () => { clearTimeout(t); t = setTimeout(preview, 350); $("#save").textContent = "Save •"; });
  const doSave = async () => { await save(ed.value); $("#save").textContent = "Saved"; toast("Saved (versioned, you can always go back)"); };
  $("#save").onclick = doSave;
  ed.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); doSave(); } });
  preview();
}
async function pageNote(id, edit) {
  const n = await api("GET", `/api/notes/${id}`);
  main().innerHTML = `<div class="page">${crumbs(n.breadcrumbs)}
    <h1 class="title"><span class="title-edit" id="ttl">${h(n.title)}</span></h1>
    <div class="sub"><span>${n.author && n.author !== "you" ? `Written by ${h(n.author)}` : "Your note"}</span><span>Updated ${fmtDate(n.updated || n.created)}</span>
      <button class="btn ghost" id="edit">${edit ? "Done" : "Edit"}</button><button class="icon-btn" id="nmore">${ICONS.more}</button></div>
    <div id="nb"></div></div>`;
  const node = NODES.get(id) || { id, title: n.title, kind: "note" };
  $("#ttl").onclick = () => renameDialog(node);
  $("#nmore").onclick = (e) => openMenu(e, node);
  $("#edit").onclick = () => go(edit ? `#/note/${id}` : `#/note/${id}?edit`);
  if (edit) renderEditor($("#nb"), n.body, async (text) => (await api("PUT", `/api/notes/${id}`, { body: text })).html);
  else { $("#nb").innerHTML = n.body.trim() ? `<div class="prose">${n.html}</div>` : `<div class="empty"><h3>Empty note</h3><p>Click Edit to start writing.</p></div>`; enhance($("#nb")); }
}

// ---- search, history
async function pageSearch(q) {
  $("#q").value = q;
  main().innerHTML = `<div class="page"><h1 class="title">Search</h1><div class="sub">Results for “${h(q)}”</div><div class="results" id="res">Searching…</div></div>`;
  const rs = await api("GET", `/api/search?q=${encodeURIComponent(q)}`);
  $("#res").innerHTML = rs.length ? rs.map((r, i) => `<div class="r" data-i="${i}"><div class="rt">${h(r.title)}</div>
    <div class="rp">${h(r.place || "")}${r.time ? ` · ${r.slide ? `slide ${r.slide} · ` : ""}at ${r.time}` : ""}${r.part?.startsWith("Generated") ? " · study material" : r.part?.startsWith("My Notes") ? " · your notes" : ""}</div>
    <div class="rs">${h(r.snippet).replace(/«/g, "<mark>").replace(/»/g, "</mark>")}</div></div>`).join("")
    : `<div class="empty"><h3>Nothing found</h3><p>Try fewer or different words.</p></div>`;
  $$("#res .r").forEach((el) => el.onclick = () => {
    const r = rs[+el.dataset.i], n = NODES.get(r.id);
    if (r.chunk) go(`#/lecture/${r.id}/slides?chunk=${r.chunk}`);
    else if (r.part?.startsWith("My Notes")) go(`#/lecture/${r.id}/notes`);
    else if (r.part?.startsWith("Generated")) go(`#/lecture/${r.id}/pack`);
    else go(hrefFor(n || { id: r.id, kind: "note" }));
  });
}
async function pageHistory() {
  const rows = await api("GET", "/api/history");
  main().innerHTML = `<div class="page"><h1 class="title">History</h1>
    <div class="sub">Every change is saved as a version in your vault, so nothing is ever lost.</div>
    <div class="toolbar"><button class="btn" id="undo">Undo the latest change</button></div>
    <div class="hist">${rows.map((r) => `<div class="h"><time>${new Date(r.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><span>${h(r.message)}</span></div>`).join("")}</div></div>`;
  $("#undo").onclick = async () => { const r = await api("POST", "/api/undo"); toast(`Undone: ${r.undone}`); await refresh(); };
}
function pageMissing() { main().innerHTML = `<div class="page"><div class="empty"><h3>Not found</h3><p>This item may have been moved or archived.</p><a class="btn" href="#/">Go home</a></div></div>`; }

// ------------------------------------------------------------------ router
let firstRoute = true;
async function route() {
  // smooth cross-fade between pages where the browser supports it
  if (!firstRoute && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let done; const ready = new Promise((r) => (done = r));
    document.startViewTransition(() => Promise.race([ready, new Promise((r) => setTimeout(r, 450))]));
    await renderRoute(); done(); return;
  }
  firstRoute = false;
  await renderRoute();
}
async function renderRoute() {
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  markActive();
  GRAPH?.destroy(); GRAPH = null;
  main().scrollTop = 0;
  main().classList.toggle("full", !parts.length || parts[0] === "graph");
  try {
    if (!parts.length || parts[0] === "graph") await pageGraph();
    else if (parts[0] === "library") pageLibrary();
    else if (parts[0] === "concept") await pageConcept(decodeURIComponent(parts.slice(1).join("/")));
    else if (parts[0] === "n") pageContainer(parts[1]);
    else if (parts[0] === "lecture") await pageLecture(parts[1], parts[2]);
    else if (parts[0] === "note") await pageNote(parts[1], query === "edit");
    else if (parts[0] === "search") await pageSearch(decodeURIComponent(parts.slice(1).join("/")));
    else if (parts[0] === "history") await pageHistory();
    else pageMissing();
  } catch (e) { console.error(e); pageMissing(); }
}

// ------------------------------------------------------------------ boot
if (store.get("theme", "dark") === "light") document.documentElement.dataset.theme = "light";
$("#add-section").onclick = () => containerDialog({});
let qt;
$("#q").addEventListener("input", (e) => { clearTimeout(qt); const v = e.target.value.trim(); qt = setTimeout(() => v && go(`#/search/${encodeURIComponent(v)}`), 300); });
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value.trim()) go(`#/search/${encodeURIComponent(e.target.value.trim())}`); });
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); $("#q").focus(); $("#q").select(); } });
addEventListener("hashchange", () => { $(".side").classList.remove("open"); route(); });
$("#menu-btn").onclick = (e) => { e.stopPropagation(); $(".side").classList.toggle("open"); };
$("#main").addEventListener("click", () => $(".side").classList.remove("open"));
addEventListener("focus", () => loadTree().catch(() => {}));
loadTree().then(route);
