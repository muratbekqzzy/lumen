// Lumen - front end. Plain JS, no build step.
let graphMod = null;
const loadGraph = () => (graphMod ||= import("./graph.js").catch((error) => { graphMod = null; throw error; }));
let GRAPH = null; // live graph instance on the current page
const $ =(s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("lumen." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("lumen." + k, JSON.stringify(v)); } catch {} },
};

// Two atmospheres share the same library. Older light/dark preferences migrate once.
const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
const normalizeTheme = (value) => ["sky", "light"].includes(value) ? "sky" : value === "aurora" ? "aurora" : "space";
const THEMES = { space: { label: "Space", next: "sky" }, sky: { label: "Sky", next: "aurora" }, aurora: { label: "Aurora", next: "space" } };
const currentTheme = () => normalizeTheme(document.documentElement.dataset.theme);
const motionIsCalm = () => motionMedia.matches || document.documentElement.dataset.motion === "calm";
function updateAtmosphereControls() {
  const now = currentTheme(), sky = now === "sky", theme = $("#theme"), next = THEMES[THEMES[now].next].label;
  if (theme) {
    theme.innerHTML = `${sky ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>' : now === "aurora" ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 15c3-7 5 3 8-4s5 3 10-5M4 20c3-4 5 1 8-2s5 1 8-3"/></svg>' : ICONS.moon}<span>${THEMES[now].label}</span>`;
    theme.title = `Switch to ${next}`;
    theme.setAttribute("aria-label", `Atmosphere: ${THEMES[now].label}. Switch to ${next}`);
    theme.setAttribute("aria-pressed", String(now !== "space"));
  }
  const motion = $("#gmotion");
  if (motion) {
    const calm = motionIsCalm();
    motion.textContent = calm ? "Still" : "Drift";
    motion.classList.toggle("on", !calm);
    motion.setAttribute("aria-pressed", String(!calm));
    motion.disabled = motionMedia.matches;
    motion.title = motionMedia.matches ? "Reduced motion follows your device settings" : calm ? "Turn gentle motion on" : "Pause gentle motion";
    motion.setAttribute("aria-label", motion.title);
  }
}
function setAtmosphere(value, persist = true) {
  const next = normalizeTheme(value);
  document.documentElement.dataset.theme = next;
  if (persist) store.set("theme", next);
  updateAtmosphereControls();
  window.dispatchEvent(new Event("lumen-theme-changed"));
}
function setMotion(value, persist = true) {
  document.documentElement.dataset.motion = value === "calm" ? "calm" : "full";
  if (persist) store.set("motion", document.documentElement.dataset.motion);
  updateAtmosphereControls();
  window.dispatchEvent(new Event("lumen-motion-changed"));
}
motionMedia.addEventListener?.("change", () => { updateAtmosphereControls(); window.dispatchEvent(new Event("lumen-motion-changed")); });

// luminous section colours: they glow as galaxies in the universe
// Section colours from the Lumen sky: blush, orchid, lilac, periwinkle, pale blue, mint, peach, pearl.
const COLORS = ["#fbd8e0", "#cf90c1", "#a898d8", "#8397c4", "#aacbe0", "#a8dcc8", "#f6c9a8", "#dde9ef"];
const EMOJIS = ["", "📚", "🧠", "🩺", "💬", "🎬", "🎨", "🔬", "📐", "📊", "🌍", "✍️", "🎼", "💻", "🕌", "🥐", "🌿", "⚖️", "🧪", "🏛️", "📷", "🗺️", "🧩", "⭐"];
const TYPES = [["academic", "Academic"], ["professional", "Professional"], ["creative", "Creative"], ["language", "Language"]];
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
let activeEditor = null;
const hasUnsavedDraft = () => Boolean(activeEditor?.element.isConnected && activeEditor.element.value !== activeEditor.savedText);
function allowEditorReplacement(nextHash) {
  if (hasUnsavedDraft()) {
    // A background refresh must never replace a draft, including after blur.
    if (nextHash === activeEditor.routeHash) return false;
    if (!confirm("You have unsaved changes. Leave this page and discard them?")) {
      history.replaceState(null, "", activeEditor.routeHash);
      return false;
    }
  }
  activeEditor = null;
  return true;
}

let treeLoadVersion = 0;
async function loadTree() {
  const version = ++treeLoadVersion;
  const incoming = await api("GET", "/api/tree");
  if (version !== treeLoadVersion) return false;
  const changed = JSON.stringify(incoming) !== JSON.stringify(TREE);
  TREE = incoming;
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
  return changed;
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
function newestFirst(a, b) {
  const stamp = value => typeof value === "number" ? value : (Date.parse(value) || Number(value) || 0);
  return stamp(b.created) - stamp(a.created);
}
function fmtTime(sec) { const s = Math.max(0, Math.floor(Number(sec) || 0)); return (s >= 3600 ? Math.floor(s / 3600) + ":" : "") + String(Math.floor(s % 3600 / 60)).padStart(s >= 3600 ? 2 : 1, "0") + ":" + String(s % 60).padStart(2, "0"); }
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
    : signedOut() ? `<div class="empty-hint">Sign in to see your sections. <a href="${h(signInHref())}" target="_top">Sign in</a></div>`
    : `<div class="empty-hint">No sections yet. Press <b>+</b> to create your first one, for example <i>Arabic</i> or <i>Neuropsychology</i>.</div>`;
  $("#nav-foot").innerHTML = `
    <div class="row" data-id="archive" data-nav="#/n/archive" title="Archive">${ICONS.archive}<span class="label">Archive</span></div>
    <div class="row" data-nav="#/history" title="History">${ICONS.clock}<span class="label">History</span></div>
    <button class="atmosphere-toggle" id="theme" type="button" aria-label="Switch atmosphere">${ICONS.moon}<span>Space</span></button>
    ${window.LumenCloud ? `<button class="icon-btn lumen-settings-btn" id="lumen-sync-settings" title="Settings" aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.05 1.57V21h-4v-.03A1.7 1.7 0 0 0 8.9 19.4 1.7 1.7 0 0 0 7 19.74l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 13.95H3v-4h.03A1.7 1.7 0 0 0 4.6 8.9 1.7 1.7 0 0 0 4.26 7l-.06-.06 2.86-2.86.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10.05 3H14a1.7 1.7 0 0 0 1.05 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10.05V14a1.7 1.7 0 0 0-1.6 1z"/></svg><span class="lumen-sync-dot" aria-hidden="true"></span></button>` : ""}`;
  $$(".side .row").forEach((r) => {
    r.addEventListener("click", (e) => {
      if (e.target.closest("[data-more]")) { e.stopPropagation(); const n = NODES.get(r.dataset.id); openMenu(e, n); return; }
      if (e.target.closest("[data-twisty]") && r.dataset.id) { toggle(r.dataset.id); return; }
      go(r.dataset.nav || hrefFor(NODES.get(r.dataset.id)));
    });
    if (r.dataset.id && !["inbox", "archive"].includes(r.dataset.id)) dragSource(r, r.dataset.id);
    if (r.dataset.id) dropTarget(r, r.dataset.id, "y");
  });
  if ($("#lumen-sync-settings")) { $("#lumen-sync-settings").onclick = () => window.LumenCloud.settings(); window.LumenCloud.updateIndicator?.(); }
  $("#theme").onclick = () => setAtmosphere(THEMES[currentTheme()].next);
  updateAtmosphereControls();
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
      items.push(["Import Markdown here", () => lectureDialog(n)]);
      items.push("-");
    }
    if (n.kind === "inbox") { items.push(["New note", () => noteDialog(n)], ["Import Markdown", () => lectureDialog(n)]); }
    if (!["inbox", "archive"].includes(n.kind)) {
      items.push(["Rename…", () => renameDialog(n)]);
      if (["section", "module"].includes(n.kind)) items.push(["Appearance & category…", () => containerDialog({ node: n })]);
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
    <label>Category</label><select name="type">${TYPES.map(([v, l]) => `<option value="${v}" ${v === (node?.type || parent?.type || "academic") ? "selected" : ""}>${l}</option>`).join("")}</select>
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
function openMarkdownImport(context = {}) {
  if (hasUnsavedDraft()) { toast('Save your notes before importing another file. Your draft is kept here.'); return; }
  if (!window.LumenImport) { toast('Import could not load. Reconnect and reload Lumen.'); return; }
  return window.LumenImport.open(context);
}
function lectureDialog(parent) {
  if (window.LumenImport && window.LumenCloud) return openMarkdownImport({parentId:parent.id});
  if (window.LumenPanopto) return window.LumenPanopto.open(parent);
  dialog(`<h3>Add a lecture${parent.kind !== "inbox" ? ` to “${h(parent.title)}”` : ""}</h3>
    <p style="font-size:14px;color:var(--muted)">Recordings are transcribed locally on this Mac with Whisper. Upload an audio/video file and optionally a PDF of the slides. A Panopto link adds playback shortcuts; it does not fetch the recording.</p>
    <label>Title</label><input type="text" name="title" required placeholder="e.g. Lecture 04 – Data screening">
    <label>Panopto link (optional, for jump-to-moment links)</label><input type="url" name="panopto_url" placeholder="https://…panopto.eu/…">
    <label>Recording language</label><select name="language"><option value="">Detect automatically</option><option value="en">English</option><option value="ar">Arabic</option><option value="fr">French</option><option value="es">Spanish</option><option value="de">German</option><option value="ru">Russian</option></select>
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
  plotlyLoading ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js"; s.onload = res; s.onerror = () => { plotlyLoading = null; s.remove(); rej(new Error("Chart library unavailable")); }; document.head.append(s); });
  return plotlyLoading;
}
function themeVars() { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(["--ink", "--ink-2", "--muted", "--line", "--panel", "--bg", "--accent", "--mark"].map((k) => [k, cs.getPropertyValue(k).trim()])); }
async function enhance(root) {
  if (!root || root.isConnected === false) return;
  for (const code of $$("pre > code.language-plotly", root)) {
    const pre = code.parentElement;
    let spec; try { spec = JSON.parse(code.textContent); } catch { continue; }
    const box = document.createElement("div"); box.className = "viz";
    box.innerHTML = `<div class="plot"></div>${spec.caption ? `<div class="cap">${h(spec.caption)}</div>` : ""}`;
    pre.replaceWith(box);
    try {
      await loadPlotly();
      if (root.isConnected === false) return;
      const t = themeVars();
      const layout = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: "Inter, sans-serif", color: t["--ink-2"] }, margin: { t: 40, r: 20, b: 50, l: 55 }, ...(spec.layout || {}) };
      window.Plotly.newPlot(box.firstElementChild, spec.data || [], layout, { responsive: true, displaylogo: false });
    } catch { box.firstElementChild.textContent = "Chart library could not load (offline?)."; }
  }
  for (const code of $$("pre > code.language-quiz", root)) renderQuiz(code);
  for (const code of $$("pre > code.language-qa", root)) {
    try { const item=JSON.parse(code.textContent); if(typeof item.q!=="string"||typeof item.a!=="string")continue;
      const box=document.createElement("details");box.className="practice-question";box.innerHTML=`<summary>${h(item.q)}</summary><div>${h(item.a).replace(/\n/g,"<br>")}</div>`;code.parentElement.replaceWith(box);
    } catch {}
  }
  for (const code of $$("pre > code.language-widget", root)) {
    const pre = code.parentElement;
    const src = code.textContent;
    const hgt = +(src.match(/height:\s*(\d+)/)?.[1] || 440);
    const t = themeVars();
    const base = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>:root{${Object.entries(t).map(([k, v]) => `${k}:${v}`).join(";")}}body{margin:0;padding:16px;font:14px/1.5 Inter,-apple-system,sans-serif;color:var(--ink);background:transparent}</style>`;
    const box = document.createElement("div"); box.className = "viz";
    const fr = document.createElement("iframe");
    fr.setAttribute("sandbox", "allow-scripts"); fr.setAttribute("title", "Interactive lecture illustration"); fr.loading = "lazy"; fr.style.height = Math.max(200,Math.min(1400,hgt)) + "px"; fr.srcdoc = base + src;
    box.append(fr); pre.replaceWith(box);
  }
  for (const img of $$(".prose img", root)) { img.loading = "lazy"; img.decoding = "async"; }
  if (window.renderMathInElement) {
    renderMathInElement(root, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true }, { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }], throwOnError: false, ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"] });
  } else setTimeout(() => window.renderMathInElement && enhance(root), 400);
}

// "Check my understanding" quizzes: ```quiz {"title": "...", "questions": [{"q": "...", "options": [...], "answer": 0, "why": "..."}]}
function renderQuiz(code) {
  let spec; try { spec = JSON.parse(code.textContent); } catch { return; }
  const qs = spec?.questions;
  if (!Array.isArray(qs) || !qs.length || qs.some(q => !q || typeof q.q !== "string" || !Array.isArray(q.options) || q.options.length < 2 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)) return;
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
  if (signedOut() && !kids(TREE).length && !kids(TREE.inbox).length) {
    main().innerHTML = `<div class="page"><div class="hero"><h1>Library</h1><p>Your sections, modules and lectures, organised your way.</p></div>${signInCard("Sign in to see your library", "Your sections, lectures and notes are kept in your account. Sign in with the same account on every device.")}</div>`;
    return;
  }
  const sections = kids(TREE).filter(isContainer);
  const lectures = []; const walk = (n) => kids(n).forEach((k) => { if (k.kind === "lecture") lectures.push(k); walk(k); });
  walk(TREE); walk(TREE.inbox);
  lectures.sort(newestFirst);
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
let graphSignature = "";
async function pageGraph(isCurrent = () => true) {
  const lectures=[];const walk=node=>kids(node).forEach(child=>{if(child.kind==='lecture')lectures.push(child);walk(child);});walk(TREE);walk(TREE.inbox);lectures.sort(newestFirst);
  main().innerHTML=`<div class="graph-page space immersive-universe">
    <div class="graph-host" id="ghost"></div>
    <div class="graph-ui"><form class="graph-tools" id="gsearch" role="search">
      <svg class="universe-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input id="gq" type="search" placeholder="Find a star" aria-label="Find a star" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gsearch-results" autocomplete="off" enterkeyhint="search">
      <button class="universe-button" id="gfit" type="button" title="Return to the whole universe" aria-label="Return to the whole universe"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/></svg></button>
      <details class="universe-options" id="goptions"><summary class="universe-button" aria-label="Universe view options" title="View options"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="var(--panel)"/><circle cx="16" cy="17" r="2.5" fill="var(--panel)"/></svg></summary><div class="universe-options-panel"><div class="view-options-row"><button type="button" class="pill on" data-f="structure" aria-pressed="true">Structure</button><button type="button" class="pill ${store.get('universeConcepts',false)?'on':''}" data-f="concepts" aria-pressed="${store.get('universeConcepts',false)}">Concepts</button><button class="pill motion-toggle" id="gmotion" type="button" aria-pressed="true">Drift</button></div><div class="view-options-row"><button type="button" class="universe-button" id="grotate-left" aria-label="Rotate universe left">↶</button><button type="button" class="universe-button" id="grotate-right" aria-label="Rotate universe right">↷</button><span>Pinch and twist to explore</span></div></div></details>
      <div class="universe-search-results" id="gsearch-results" role="listbox" aria-label="Matching stars" hidden></div>
    </form></div>
    <div class="universe-zoom" aria-label="Zoom controls"><button type="button" class="universe-button" id="gzoom-in" aria-label="Zoom in">+</button><button type="button" class="universe-button" id="gzoom-out" aria-label="Zoom out">−</button></div>
    <aside class="graph-panel" id="gpanel" hidden></aside>
    ${lectures[0]?`<div class="u-dock"><a class="u-continue" href="#/lecture/${lectures[0].id}"><span>Continue reading</span><b>${h(lectures[0].title)}</b><span aria-hidden="true">↗</span></a></div>`:''}
  </div>`;
  const host=$('#ghost'),input=$('#gq'),results=$('#gsearch-results'),options=$('#goptions');
  $('#gsearch').onsubmit=event=>event.preventDefault();
  $('#gmotion').onclick=()=>setMotion(motionIsCalm()?'full':'calm');updateAtmosphereControls();
  const [engine,data]=await Promise.all([loadGraph(),api('GET','/api/graph')]);if(!isCurrent()||!host?.isConnected)return;
  graphSignature=JSON.stringify(data);
  document.body.dataset.stars=data.nodes.length?'1':'0';   // the sky recedes when your own stars are showing
  if(!data.nodes.length){const welcome=document.createElement('div');welcome.className='universe-welcome';if(signedOut()){welcome.innerHTML=`<p>Sign in to see your universe</p><a class="btn primary" href="${h(signInHref())}" target="_top">Sign in</a>`;host.parentElement.append(welcome);}else{welcome.innerHTML='<button class="btn primary" id="begin-universe">Import a lecture</button>';host.parentElement.append(welcome);$('#begin-universe').onclick=()=>openMarkdownImport();}}
  const open=node=>{if(!node)return;go(node.kind==='concept'?`#/concept/${encodeURIComponent(node.title)}`:hrefFor(node));};
  const focus=node=>{if(node.kind==='concept'){const button=$('[data-f="concepts"]');button?.classList.add('on');button?.setAttribute('aria-pressed','true');store.set('universeConcepts',true);}GRAPH?.focus(node.id);};
  GRAPH=engine.mountGraph(host,data,{concepts:store.get('universeConcepts',false),onOpen:open,onSelect:(node,neighbors)=>{
    if(!isCurrent())return;const panel=$('#gpanel');if(!panel)return;if(!node){panel.hidden=true;return;}
    panel.hidden=false;panel.innerHTML=`<button type="button" class="icon-btn gp-close" aria-label="Close star details">×</button><div class="gp-k">${h(KIND_LABEL[node.kind]||node.kind)}</div><div class="gp-t">${h(node.title)}</div><div class="gp-list">${neighbors.sort((a,b)=>(a.kind==='concept')-(b.kind==='concept')||a.title.localeCompare(b.title)).slice(0,12).map(neighbor=>`<button data-id="${h(neighbor.id)}"><span class="dot" style="--c:${h(neighbor.color||'var(--accent)')}"></span>${h(neighbor.title)}</button>`).join('')}</div><button class="btn primary gp-open">Open ${h(KIND_LABEL[node.kind]?.toLowerCase()||'')}</button>`;
    panel.querySelector('.gp-open').onclick=()=>open(node);panel.querySelector('.gp-close').onclick=home;panel.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>{const target=data.nodes.find(n=>n.id===button.dataset.id);if(target)focus(target);});
  }});
  GRAPH.setInputActive?.(document.activeElement===input);
  $$('.graph-tools [data-f]').forEach(button=>button.onclick=()=>{const enabled=button.classList.toggle('on');button.setAttribute('aria-pressed',String(enabled));if(button.dataset.f==='concepts')store.set('universeConcepts',enabled);GRAPH?.setFilter({[button.dataset.f]:enabled});});
  function home(){input.value='';results.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute?.('aria-activedescendant');input.blur?.();GRAPH?.setQuery('');GRAPH?.clear();GRAPH?.fit();options.open=false;}
  $('#gfit').onclick=home;$('#gzoom-in').onclick=()=>GRAPH?.zoomBy?.(1.25);$('#gzoom-out').onclick=()=>GRAPH?.zoomBy?.(.8);$('#grotate-left').onclick=()=>GRAPH?.rotateBy?.(-Math.PI/8);$('#grotate-right').onclick=()=>GRAPH?.rotateBy?.(Math.PI/8);
  let matches=[],active=-1;
  function pick(node){results.hidden=true;input.setAttribute('aria-expanded','false');input.blur?.();focus(node);options.open=false;}
  function renderMatches(){const query=input.value.trim().toLowerCase();GRAPH?.setQuery(query);active=-1;
    matches=query?data.nodes.filter(n=>n.title.toLowerCase().includes(query)).sort((a,b)=>(a.title.toLowerCase()===query?-1:0)-(b.title.toLowerCase()===query?-1:0)).slice(0,6):[];
    results.hidden=!query;input.setAttribute('aria-expanded',String(!!query));input.removeAttribute?.('aria-activedescendant');
    results.innerHTML=query?(matches.length?matches.map((node,index)=>`<button type="button" role="option" aria-selected="false" tabindex="-1" id="gresult-${index}" data-result="${index}"><span>${h(node.title)}</span><small>${h(KIND_LABEL[node.kind]||node.kind)}</small></button>`).join(''):'<p role="status">No matching stars</p>'):'';
    $$('[data-result]',results).forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>pick(matches[Number(button.dataset.result)]);});
    if(!query){GRAPH?.clear();GRAPH?.fit();}
  }
  input.addEventListener('focus',()=>{GRAPH?.setInputActive?.(true);if(input.value.trim())renderMatches();});
  input.addEventListener('blur',()=>{GRAPH?.setInputActive?.(false);results.hidden=true;input.setAttribute('aria-expanded','false');});
  input.addEventListener('input',renderMatches);
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();home();return;}
    if(['ArrowDown','ArrowUp'].includes(event.key)&&matches.length){event.preventDefault();active=active<0?(event.key==='ArrowDown'?0:matches.length-1):(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;input.setAttribute('aria-activedescendant','gresult-'+active);$$('[data-result]',results).forEach((button,index)=>button.setAttribute('aria-selected',String(index===active)));}
  });
  $('#gsearch').addEventListener('submit',event=>{event.preventDefault();if(matches[active<0?0:active])pick(matches[active<0?0:active]);});
  if(input.value.trim())renderMatches();
}

async function pageConcept(name, isCurrent = () => true) {
  const c = await api("GET", `/api/concept/${encodeURIComponent(name)}`);
  if (!isCurrent()) return;
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
  const host = $("#lg");
  const [g, data] = await Promise.all([loadGraph(), api("GET", "/api/graph")]);
  if (!isCurrent() || !host?.isConnected) return;
  const me = data.nodes.find((n) => n.kind === "concept" && n.title.toLowerCase() === c.name.toLowerCase()) || data.nodes.find((n) => n.title.toLowerCase() === c.name.toLowerCase());
  if (!me) { $("#lg").remove(); return; }
  // local neighbourhood: the concept, what mentions it, and their other concepts
  const keep = new Set([me.id]);
  data.edges.forEach((e) => { if (e.source === me.id) keep.add(e.target); if (e.target === me.id) keep.add(e.source); });
  const first = new Set(keep);
  data.edges.forEach((e) => { if (first.has(e.source) && e.source !== me.id && keep.size < 60) keep.add(e.target); });
  const sub = { nodes: data.nodes.filter((n) => keep.has(n.id)), edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  GRAPH = g.mountGraph(host, sub, { focusId: me.id, onOpen: (n) => n && (n.kind === "concept" ? go(`#/concept/${encodeURIComponent(n.title)}`) : go(hrefFor(n))), onSelect: () => {} });
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
  if (n.status === "complete" && n.generated_source === "extractive") return "Draft outline ready";
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
      <button class="btn primary" data-a="lecture">${ICONS.plus} Import Markdown</button>
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
async function pageLecture(id, tab, isCurrent = () => true) {
  clearInterval(poll);
  const d = await api('GET', `/api/lectures/${id}`);
  if (!isCurrent()) return;
  LECTURE = d;
  const m = d.meta, busy = ['processing','queued','transcribing'].includes(m.status);
  tab = ['slides','notes'].includes(tab) ? tab : 'pack';
  main().innerHTML = `<div class="page lecture-page" id="lec">
    ${crumbs(d.breadcrumbs.slice(0,-1))}
    <div class="lecture-heading"><h1 class="title"><span class="title-edit" id="ttl">${h(m.title)}</span></h1><div class="lecture-actions">${window.LumenCloud ? '<button class="btn ghost" id="update-lecture">Import Markdown</button>' : ''}<button class="icon-btn" id="lmore" aria-label="Lecture options">${ICONS.more}</button></div></div>
    ${m.materials_stale ? '<p class="study-notice">The source changed since this material was prepared. Import an updated Markdown file when ready.</p>' : ''}
    ${busy ? '<p class="study-notice" role="status">This lecture is still processing on your Mac.</p>' : ''}
    <div class="tabs" role="tablist" aria-label="Lecture views">${[['pack','Lecture'],['slides','Slides'],['notes','Notes']].map(([key,label])=>`<button class="tab ${key===tab?'on':''}" role="tab" aria-selected="${key===tab}" aria-controls="tabbody" data-t="${key}">${label}</button>`).join('')}</div>
    <div id="tabbody" role="tabpanel"></div>
  </div>`;
  $('#ttl').onclick = () => renameDialog(NODES.get(id) || {id,title:m.title});
  $('#lmore').onclick = e => openMenu(e,NODES.get(id) || {id,title:m.title,kind:'lecture'});
  if ($('#update-lecture')) $('#update-lecture').onclick = () => openMarkdownImport({lectureId:id});
  $$('.tab').forEach(button => button.onclick = () => {
    const nextHash = `#/lecture/${id}/${button.dataset.t}`;
    if (!allowEditorReplacement(nextHash)) return;
    history.replaceState(null,'',nextHash); pageLectureTab(id,button.dataset.t);
  });
  pageLectureTab(id,tab);
  if (busy) poll = setInterval(async()=>{const next=await api('GET',`/api/lectures/${id}`);if(isCurrent()&&!['processing','queued','transcribing'].includes(next.meta.status)){clearInterval(poll);await refresh();}},5000);
}
function lessonOutline(body) {
  const article=$('.lecture-prose',body); if (!article) return;
  const first=article.firstElementChild;
  if(first?.tagName==='H1'&&([LECTURE.meta.title,'study-pack.md','study pack'].some(title=>first.textContent.trim().toLowerCase()===title.toLowerCase())))first.remove();
  $$('h1',article).filter(node=>['study-pack.md','explanation.md'].includes(node.textContent.trim().toLowerCase())).forEach(node=>node.remove());
  const all=$$('h1,h2,h3',article).filter(node=>!node.closest('.quiz,.viz')),level=Math.min(3,...all.map(node=>Number(node.tagName[1]))),top=all.filter(node=>Number(node.tagName[1])===level);
  const headings=(top.length>=3?top:all.filter(node=>Number(node.tagName[1])<=level+1)).slice(0,18);
  if(headings.length<3)return;
  headings.forEach((node,i)=>node.id='lesson-heading-'+i);
  const outline=document.createElement('details');outline.className='lesson-outline';
  outline.innerHTML='<summary><span>On this page</span><svg class="outline-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg></summary><nav aria-label="Lecture contents">'+headings.map((node,i)=>`<button type="button" data-heading="${i}" class="${Number(node.tagName[1])>level?'outline-sub':''}">${h(node.textContent)}</button>`).join('')+'</nav>';
  article.before(outline);
  $$('[data-heading]',outline).forEach(button=>button.onclick=()=>headings[Number(button.dataset.heading)].scrollIntoView({behavior:motionIsCalm()?'auto':'smooth',block:'start'}));
}
function pageLectureTab(id, tab) {
  window.LumenPDF?.clearViews();
  tab=['slides','notes'].includes(tab)?tab:'pack';
  $$('.tab').forEach(button=>{button.classList.toggle('on',button.dataset.t===tab);button.setAttribute('aria-selected',String(button.dataset.t===tab));});
  const d=LECTURE,body=$('#tabbody'),gen=d.generated_html;
  if(tab==='notes')return renderEditor(body,d.my_notes,async(text,expectedBody)=>{const result=await api('PUT',`/api/lectures/${id}/notes`,{body:text,expectedBody});d.my_notes=text;return result;},'Your notes and practice questions. ⌘S to save.',true);
  if(tab==='slides'){renderSlides(body,id);enhance(body);return;}
  const extra=d.meta.lesson_source==='markdown'?[]:Object.keys(gen).filter(name=>name.startsWith('explain'));
  body.innerHTML=gen['study-pack.md']?`<article class="prose lecture-prose">${gen['study-pack.md']}${extra.map(name=>`<section class="lesson-supplement"><h2>Further explanation</h2>${gen[name]}</section>`).join('')}</article>`:`<div class="empty"><span class="welcome-kicker">Room for understanding</span><h3>Your lecture, ready to read.</h3><p>Import one prepared Markdown file with your explanations, examples and useful visuals. Slides can be added whenever you need them.</p><button class="btn primary" id="import-empty-lecture">Import Markdown</button></div>`;
  if(d.prepared_practice_html)body.insertAdjacentHTML('beforeend',`<details class="lesson-practice"><summary>Practice questions</summary><div class="prose">${d.prepared_practice_html}</div></details>`);
  $('#import-empty-lecture')?.addEventListener('click',()=>openMarkdownImport({lectureId:id}));
  lessonOutline(body);enhance(body);
}
function renderSlides(body, id) {
  const d=LECTURE,original=d.meta.source_pdf,prepared=d.slide_explanations_html||[];
  const pageNotes=prepared.filter(note=>note.page>0),count=Math.min(300,Math.max(d.meta.slide_count||0,...pageNotes.map(note=>note.page),...(d.chunks||[]).map(chunk=>chunk.page||0),original?1:0));
  const numbers=original||!window.LumenCloud?Array.from({length:count},(_,index)=>index+1):[...new Set([...pageNotes.map(note=>note.page),...d.chunks.map(chunk=>chunk.page).filter(Boolean)])].sort((a,b)=>a-b);
  const chunks=numbers.map(page=>d.chunks.find(chunk=>chunk.page===page)||{n:'pdf-'+page,page,title:'Slide '+page,said:[]});
  body.innerHTML=`<div class="slides-toolbar"><p>Original slides, with their prepared explanation.</p>${window.LumenPDF&&window.LumenCloud?`<button class="btn ghost" id="add-lecture-slides">${original?'Change slides':'Add slides'}</button><input type="file" id="lecture-slides-file" accept=".pdf,application/pdf" hidden>`:''}</div>
    ${original&&!original.uploaded?`<p class="study-notice">${window.LUMEN_HOSTED?'The original PDF is waiting to upload from its saved device.':'The original PDF is saved on this device only.'}</p>`:''}
    ${!original&&window.LumenCloud?'<p class="slide-source-note">Slides are optional. Earlier text-only imports need the original PDF attached to show its actual pages.</p>':''}
    ${prepared.filter(note=>note.page===0).map(note=>`<div class="prose">${note.html}</div>`).join('')}
    ${!count?'<div class="empty"><h3>Slides, when you need them.</h3><p>Your lecture material works on its own. Add a PDF here, or include a Slide explanations section in your next Markdown file.</p></div>':`<div class="slides">${chunks.map(chunk=>{
      const note=prepared.find(item=>item.page===chunk.page),textOnly=note&&!original&&window.LumenCloud,image=textOnly?'':original&&window.LumenPDF&&(chunk.page<=(d.meta.slide_count||count))?`<div class="pdf-page-host" data-pdf-page="${chunk.page}"></div>`:!window.LumenCloud?`<img loading="lazy" src="/api/lectures/${id}/slides/${chunk.page}.png" alt="Slide ${chunk.page}">`:`<div class="ghost-slide"><div><b>Slide ${chunk.page}</b><p>${h(chunk.slide_text||'Add the PDF to see the original slide.')}</p></div></div>`;
      return `<section class="chunk ${textOnly?'slide-text-only':''}" id="chunk-${chunk.n}">${image?`<div>${image}</div>`:''}<div><h3 class="slide-title">${h(note?.title||chunk.title||'Slide '+chunk.page)}</h3>${note?.html?`<div class="prose slide-explanation">${note.html}</div>`:chunk.said?.length?`<details class="source-wording"><summary>Lecturer’s explanation</summary><div class="prose">${chunk.said.map(segment=>`<p>${h(segment.text)}</p>`).join('')}</div></details>`:'<p class="slide-source-note">No prepared explanation for this page yet.</p>'}</div></section>`;
    }).join('')}</div>`}`;
  if($('#add-lecture-slides')){
    const input=$('#lecture-slides-file'),button=$('#add-lecture-slides');button.onclick=()=>input.click();input.onchange=async()=>{const file=input.files?.[0];if(!file)return;button.disabled=true;try{let pages;try{pages=(await window.LumenPDF.extractText(file)).length;}catch{}const result=await window.LumenPDF.attach(id,file,pages);toast(result.message);}catch(error){toast(error.message);}finally{button.disabled=false;input.value='';}};
  }
  if(window.LumenPDF&&original)$$('[data-pdf-page]',body).forEach(host=>window.LumenPDF.mountPage(host,original,Number(host.dataset.pdfPage)));
  if(!window.LumenCloud&&d.pages_not_shown?.length)body.insertAdjacentHTML('beforeend',`<details class="lesson-practice"><summary>Other PDF pages</summary><div class="grid">${d.pages_not_shown.map(page=>`<img loading="lazy" src="/api/lectures/${id}/slides/${page}.png" alt="Slide ${page}">`).join('')}</div></details>`);
  const want=new URLSearchParams(location.hash.split('?')[1]||'').get('chunk');if(want){const node=$('#chunk-'+want);node?.scrollIntoView({block:'start'});}
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
function renderEditor(body, text, save, hint, practice = false) {
  body.innerHTML = `<div class="notes-workspace"><div class="toolbar editor-toolbar"><button class="btn primary" id="save">Save</button><button class="btn ghost" id="preview-notes" type="button" aria-pressed="false" aria-controls="pv">Preview</button>${practice ? '<button class="btn ghost" id="add-practice-question">Add a question</button>' : ''}<span class="editor-shortcut" title="${h(hint || 'Markdown supported.')}" aria-label="Command or Control S to save">⌘S</span></div>
    <p id="editor-sync-notice" role="status" hidden style="color:var(--muted);font-size:13px">Changes arrived from another device. Your draft is kept here; saving will preserve both versions if needed.</p>
    <div class="editor single-editor"><textarea id="ed" spellcheck="true" aria-label="Your notes">${h(text)}</textarea><div class="preview prose" id="pv" hidden aria-label="Notes preview"></div></div></div>`;
  const ed = $("#ed"), pv = $("#pv"), button = $("#save"), viewButton = $("#preview-notes");
  ed.hidden=false;pv.hidden=true;
  const editor = { element: ed, savedText: text || "", routeHash: location.hash, saving: false,
    accountId: window.LumenCloud?.activeAccountId || null };
  activeEditor = editor;
  let previewVersion = 0, showingPreview = false;
  const preview = async () => {
    if(!showingPreview)return;
    const version = ++previewVersion, draft = ed.value;
    pv.innerHTML = '<p class="empty-note-preview" role="status">Preparing preview…</p>';
    try {
      const html = await api("POST", "/api/render", { body: draft });
      if (version !== previewVersion || !showingPreview || !ed.isConnected || ed.value !== draft) return;
      pv.innerHTML = html || '<p class="empty-note-preview">Your notes will appear here.</p>'; enhance(pv);
    } catch (error) {
      if(version===previewVersion&&showingPreview&&ed.isConnected)pv.innerHTML='<p class="empty-note-preview" role="status">Preview could not be loaded. Choose Edit to return to your notes.</p>';
      if (ed.isConnected) console.error("Could not preview note", error);
    }
  };
  const showPreview = on => {showingPreview=on;ed.hidden=on;pv.hidden=!on;if(viewButton){viewButton.textContent=on?'Edit':'Preview';viewButton.setAttribute('aria-pressed',String(on));}if(on)preview();else{previewVersion++;ed.focus?.();}};
  if(viewButton)viewButton.onclick=()=>showPreview(!showingPreview);
  ed.addEventListener("input", () => { button.textContent = ed.value === editor.savedText ? "Saved" : "Save •"; });
  const doSave = async () => {
    if (editor.saving) return;
    if (editor.accountId !== (window.LumenCloud?.activeAccountId || null)) {
      toast("The signed-in account changed. Copy your draft before opening the other account’s library.");
      return;
    }
    const sent = ed.value;
    editor.saving = true; button.disabled = true; button.textContent = "Saving…";
    try {
      const result = await save(sent, editor.savedText);
      editor.savedText = sent;
      button.textContent = ed.value === sent ? "Saved" : "Save •";
      toast(result?.conflictPreserved ? "Saved. The other device’s version is kept as a conflict copy." : (window.LumenCloud ? "Saved on this device. Automatic sync resumes when online." : "Saved in your local vault."));
    } catch (error) {
      button.textContent = "Save •";
      console.error("Could not save note", error);
    } finally {
      editor.saving = false; button.disabled = false;
    }
  };
  button.onclick = doSave;
  ed.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); doSave(); } });
  if ($('#add-practice-question')) $('#add-practice-question').onclick = () => dialog(`<h3>Add a practice question</h3><label>Question</label><textarea name="question" rows="3" required></textarea><label>Answer</label><textarea name="answer" rows="4" required></textarea><div class="actions"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary" type="submit">Insert question</button></div>`, form => {
    const block='\n\n```qa\n'+JSON.stringify({q:form.question.value.trim(),a:form.answer.value.trim()})+'\n```\n';
    showPreview(false);
    ed.setRangeText(block,ed.selectionStart,ed.selectionEnd,'end');ed.dispatchEvent(new Event('input'));ed.focus();
  });
}
async function pageNote(id, edit, isCurrent = () => true) {
  const n = await api("GET", `/api/notes/${id}`);
  if (!isCurrent()) return;
  main().innerHTML = `<div class="page">${crumbs(n.breadcrumbs)}
    <h1 class="title"><span class="title-edit" id="ttl">${h(n.title)}</span></h1>
    <div class="sub"><span>${n.author && n.author !== "you" ? `Written by ${h(n.author)}` : "Your note"}</span><span>Updated ${fmtDate(n.updated || n.created)}</span>
      <button class="btn ghost" id="edit">${edit ? "Done" : "Edit"}</button><button class="icon-btn" id="nmore">${ICONS.more}</button></div>
    <div id="nb"></div></div>`;
  const node = NODES.get(id) || { id, title: n.title, kind: "note" };
  $("#ttl").onclick = () => renameDialog(node);
  $("#nmore").onclick = (e) => openMenu(e, node);
  $("#edit").onclick = () => go(edit ? `#/note/${id}` : `#/note/${id}?edit`);
  if (edit) renderEditor($("#nb"), n.body, (text, expectedBody) => api("PUT", `/api/notes/${id}`, { body: text, expectedBody }));
  else { $("#nb").innerHTML = n.body.trim() ? `<div class="prose">${n.html}</div>` : `<div class="empty"><h3>Empty note</h3><p>Click Edit to start writing.</p></div>`; enhance($("#nb")); }
}

// ---- search, history
async function pageSearch(q, isCurrent = () => true) {
  $("#q").value = q;
  main().innerHTML = `<div class="page"><h1 class="title">Search</h1><div class="sub">Results for “${h(q)}”</div><div class="results" id="res">Searching…</div></div>`;
  const rs = await api("GET", `/api/search?q=${encodeURIComponent(q)}`);
  if (!isCurrent()) return;
  $("#res").innerHTML = rs.length ? rs.map((r, i) => `<div class="r" data-i="${i}"><div class="rt">${h(r.title)}</div>
    <div class="rp">${h(r.place || "")}${r.time ? ` · ${r.slide ? `slide ${r.slide} · ` : ""}at ${r.time}` : ""}${r.part?.startsWith("Generated") ? " · study material" : r.part?.startsWith("My Notes") ? " · your notes" : ""}</div>
    <div class="rs">${h(r.snippet).replace(/«/g, "<mark>").replace(/»/g, "</mark>")}</div></div>`).join("")
    : `<div class="empty"><h3>Nothing found</h3><p>Try fewer or different words.</p></div>`;
  $$("#res .r").forEach((el) => el.onclick = () => {
    const r = rs[+el.dataset.i], n = NODES.get(r.id);
    if (r.chunk) go(`#/lecture/${r.id}/slides?chunk=${r.chunk}`);
    else if (r.part?.startsWith("Source")) go(`#/lecture/${r.id}/slides`);
    else if (r.part?.startsWith("My Notes")) go(`#/lecture/${r.id}/notes`);
    else if (r.part?.startsWith("Generated")) go(`#/lecture/${r.id}/pack`);
    else go(hrefFor(n || { id: r.id, kind: "note" }));
  });
}
async function pageHistory(isCurrent = () => true) {
  const rows = await api("GET", "/api/history");
  if (!isCurrent()) return;
  main().innerHTML = `<div class="page"><h1 class="title">History</h1>
    <div class="sub">${window.LumenCloud ? "Recent changes on this device (up to 30). Library sync shares the current version; this history is not a backup." : "Changes are versioned in your local vault. Keep independent backups of important work."}</div>
    <div class="toolbar"><button class="btn" id="undo">Undo the latest change</button></div>
    <div class="hist">${rows.map((r) => `<div class="h"><time>${new Date(r.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><span>${h(r.message)}</span></div>`).join("")}</div></div>`;
  $("#undo").onclick = async () => { const r = await api("POST", "/api/undo"); toast(`Undone: ${r.undone}`); await refresh(); };
}
function pageMissing() {
  if (signedOut()) { main().innerHTML = `<div class="page">${signInCard("Sign in to open this", "This link points to something in your library. Sign in and you'll come straight back here.")}</div>`; return; }
  main().innerHTML = `<div class="page"><div class="empty"><h3>Not found</h3><p>This item may have been moved or archived.</p><a class="btn" href="#/">Go home</a></div></div>`;
}

// ---- signed-out state (hosted, synced Lumen only)
function signedOut() { return !!window.LumenCloud?.needsSignIn; }
function signInHref() { return window.LumenCloud?.signInHref?.() || "/signin-with-chatgpt?return_to=%2F"; }
function signInCard(title, text) {
  return `<div class="empty signin-card"><h3>${h(title)}</h3><p>${h(text)}</p><a class="btn primary" href="${h(signInHref())}" target="_top">Sign in</a></div>`;
}
function signInBanner() {
  if (!signedOut() || main().querySelector(".signin-card, .signin-banner, .universe-welcome")) return;
  const banner = document.createElement("div");
  banner.className = "signin-banner"; banner.setAttribute("role", "status");
  banner.innerHTML = `<span>You're signed out, so your library isn't shown here.</span><a class="btn primary" href="${h(signInHref())}" target="_top">Sign in</a>`;
  (main().querySelector(".page") || main()).prepend(banner);
}
function requireSignIn() { if (!signedOut()) return false; window.LumenCloud?.settings?.(); return true; }

// ------------------------------------------------------------------ router
let firstRoute = true, routeVersion = 0, activeTransition = null;
async function route(options = {}) {
  const hash = location.hash;
  if (!allowEditorReplacement(hash)) return;
  const version = ++routeVersion;
  const isCurrent = () => version === routeVersion && location.hash === hash;
  activeTransition?.skipTransition?.();
  const render = () => isCurrent() ? renderRoute(hash, isCurrent) : undefined;
  const animate = !firstRoute && options.animate !== false && document.startViewTransition && !motionIsCalm();
  firstRoute = false;
  if (!animate) return render();
  const transition = document.startViewTransition(render);
  activeTransition = transition;
  // ready/finished reject when a newer navigation skips the snapshot.
  transition.ready?.catch(() => {});
  transition.finished?.catch(() => {}).finally(() => { if (activeTransition === transition) activeTransition = null; });
  try { await transition.updateCallbackDone; } catch (error) { if (isCurrent()) console.error(error); }
}
async function renderRoute(hash = location.hash, isCurrent = () => true) {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  markActive();
  clearInterval(poll);
  window.LumenPDF?.clearViews();
  GRAPH?.destroy(); GRAPH = null;
  main().scrollTop = 0;
  main().classList.toggle("full", !parts.length || parts[0] === "graph");
  document.documentElement.dataset.view = !parts.length || parts[0] === "graph" ? "universe" : "reading";
  window.dispatchEvent(new Event("lumen-scene-changed"));
  try {
    if (!parts.length || parts[0] === "graph") await pageGraph(isCurrent);
    else if (parts[0] === "library") pageLibrary();
    else if (parts[0] === "concept") await pageConcept(decodeURIComponent(parts.slice(1).join("/")), isCurrent);
    else if (parts[0] === "n") pageContainer(parts[1]);
    else if (parts[0] === "lecture") await pageLecture(parts[1], parts[2], isCurrent);
    else if (parts[0] === "note") await pageNote(parts[1], query === "edit", isCurrent);
    else if (parts[0] === "search") await pageSearch(decodeURIComponent(parts.slice(1).join("/")), isCurrent);
    else if (parts[0] === "history") await pageHistory(isCurrent);
    else pageMissing();
    if (isCurrent()) signInBanner();
  } catch (e) { if (isCurrent()) { console.error(e); pageMissing(); } }
}

// ------------------------------------------------------------------ boot
setAtmosphere(store.get("theme", "space"), false);
setMotion(store.get("motion", "full"), false);
$("#add-section").onclick = () => { if (!requireSignIn()) containerDialog({}); };
$("#import-markdown")?.addEventListener("click", () => { if (requireSignIn()) return; const parts = location.hash.split("/"); openMarkdownImport(parts[1] === "lecture" ? {lectureId:parts[2]} : {parentId:parts[1] === "n" ? parts[2] : null}); });
let qt;
$("#q").addEventListener("input", (e) => { clearTimeout(qt); const v = e.target.value.trim(); qt = setTimeout(() => v && go(`#/search/${encodeURIComponent(v)}`), 300); });
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value.trim()) go(`#/search/${encodeURIComponent(e.target.value.trim())}`); });
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); $("#q").focus(); $("#q").select(); } });
addEventListener("hashchange", () => { $(".side").classList.remove("open"); route(); });
$("#menu-btn").onclick = (e) => { e.stopPropagation(); $(".side").classList.toggle("open"); };
$("#main").addEventListener("click", () => $(".side").classList.remove("open"));
addEventListener("focus", () => loadTree().catch(() => {}));
let remoteRefreshNeeded=false;
function refreshAfterSync(){
 if(hasUnsavedDraft() || activeEditor?.saving || document.activeElement?.matches("textarea,input,[contenteditable=true]")) {
   remoteRefreshNeeded=true;
   const notice = $("#editor-sync-notice");
   if (notice) notice.hidden = false;
   return;
 }
 remoteRefreshNeeded=false;
 const hash = location.hash;
 loadTree().then(async (changed) => {
   if (!changed || hash !== location.hash) return;
   // A text-only sync need not recreate the universe or reset its camera.
   if (GRAPH && (!hash || hash === "#/" || hash === "#/graph")) {
     const next = await api("GET", "/api/graph");
     if (hash !== location.hash || JSON.stringify(next) === graphSignature) return;
   }
   if (hasUnsavedDraft() || activeEditor?.saving) { remoteRefreshNeeded = true; return; }
   return route({ animate: false });
 }).catch(console.error);
}
addEventListener("lumen-remote-updated", refreshAfterSync);
addEventListener("lumen-auth-changed", () => { loadTree().then(() => route({ animate: false })).catch(console.error); });
document.addEventListener("focusout",()=>{if(remoteRefreshNeeded)setTimeout(refreshAfterSync,150)});
addEventListener("beforeunload", (event) => {
  if (!hasUnsavedDraft()) return;
  event.preventDefault(); event.returnValue = "";
});
loadTree().then(route);
