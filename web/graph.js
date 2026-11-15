// Lumen's knowledge universe. Library records are the stars; ambient dust is decorative.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from "./force.js";

const KIND_R = { section: 5.2, module: 3.6, lecture: 3.4, note: 2.4, concept: 1.7 };
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Inter", -apple-system, sans-serif';
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function rgb(value) {
  const hex = typeof value === "string" && /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(value) ? value.slice(1) : "c4b5fd";
  const n = parseInt(hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${clamp(a, 0, 1)})`;
const palettes = {
  space: { ink: "#f2edff", muted: "#a59abf", star: "#dbc9ff", concept: "#b9bbdf", bridge: "#f6cfa0", dust: "#d5cefa", core: "#ffffff", halo: "#baa0fa", edge: .33 },
  sky: { ink: "#3d315e", muted: "#685576", star: "#7354ab", concept: "#6e6994", bridge: "#9c683c", dust: "#7b68a6", core: "#4e3b73", halo: "#a797d0", edge: .38 },
};
const glowCache = new Map();
function glow(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, rgba(color, .72)); gradient.addColorStop(.16, rgba(color, .32));
  gradient.addColorStop(.48, rgba(color, .06)); gradient.addColorStop(1, rgba(color, 0));
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  if (glowCache.size > 80) glowCache.delete(glowCache.keys().next().value);
  glowCache.set(color, c); return c;
}

export function mountGraph(host, data, opts = {}) {
  const { mini = false, onOpen = () => {}, onSelect = () => {}, focusId = null, stars: wantStars = true } = opts;
  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas"; canvas.tabIndex = mini ? -1 : 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", mini ? "Knowledge constellation preview" : "Interactive knowledge constellation. Drag to explore, use plus or minus to zoom, 0 to fit, Escape to clear selection, Enter to open a selected star.");
  host.append(canvas);
  const ctx = canvas.getContext("2d"), motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const cleanups = [];
  function listen(target, name, handler, options) { target.addEventListener(name, handler, options); cleanups.push(() => target.removeEventListener(name, handler, options)); }
  let W = 0, H = 0, dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  let destroyed = false, raf = null, palette = palettes.space, sky = false, reduceMotion = false;
  let t0 = performance.now(), last = -Infinity, settled = false, needsDraw = true;
  const nodes = (data.nodes || []).map((n, i) => ({ ...n, title: String(n.title || "Untitled"), i, vis: 0, born: 100 + Math.min(i * 12, 720),
    r: (KIND_R[n.kind] || 2) + Math.min(5, Math.sqrt(Math.max(0, n.degree || 0)) * (n.kind === "concept" ? .55 : .35)),
    phase: Math.random() * Math.PI * 2, dx: 0, dy: 0 }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = (data.edges || []).filter(e => byId.has(e.source) && byId.has(e.target)).map(e => ({ ...e, vis: 0 }));
  const nbrs = new Map(nodes.map(n => [n.id, new Set()]));
  links.forEach(l => { nbrs.get(l.source).add(l.target); nbrs.get(l.target).add(l.source); });
  for (const n of nodes) n.galaxy = n.section || (n.kind !== "concept" ? "inbox" : null);
  for (const n of nodes) if (!n.galaxy) {
    const counts = new Map();
    nbrs.get(n.id).forEach(id => { const g = byId.get(id).galaxy; if (g) counts.set(g, (counts.get(g) || 0) + 1); });
    n.galaxy = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "inbox";
  }
  const sectionInfo = new Map(nodes.filter(n => n.kind === "section").map(s => [s.id, { title: s.title, color: s.color }]));
  const galaxyIds = [...new Set(nodes.map(n => n.galaxy))];
  const galaxies = new Map(galaxyIds.map((id, i) => {
    const info = sectionInfo.get(id) || { title: id === "inbox" ? "Inbox" : "Unsorted" };
    const angle = i / galaxyIds.length * Math.PI * 2 - Math.PI / 2, radius = galaxyIds.length > 1 ? 150 + 70 * Math.sqrt(galaxyIds.length) : 0;
    return [id, { id, ...info, ax: Math.cos(angle) * radius, ay: Math.sin(angle) * radius, cx: Math.cos(angle) * radius, cy: Math.sin(angle) * radius, rad: 40, n: 0, spin: Math.random() * 6 }];
  }));
  function colorOf(n) {
    if (n.kind === "concept") return n.bridges > 1 ? palette.bridge : palette.concept;
    const original = n.color || galaxies.get(n.galaxy)?.color;
    if (!original) return palette.star;
    if (!sky) return `#${rgb(original).map(v => v.toString(16).padStart(2, "0")).join("")}`;
    // Pastel section colours need a darker ink on the lavender sky.
    const c = rgb(original).map(v => Math.round(v * .55));
    return `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`;
  }
  nodes.forEach((n, i) => { const g = galaxies.get(n.galaxy), a = i * 2.399, d = 4 + Math.sqrt(i) * 6; n.x = g.ax + Math.cos(a) * d; n.y = g.ay + Math.sin(a) * d; });
  const sim = forceSimulation(nodes)
    .force("link", forceLink(links).id(d => d.id).distance(l => l.type === "contains" ? 38 : 58).strength(l => l.type === "contains" ? .75 : .25))
    .force("charge", forceManyBody().strength(d => d.kind === "section" ? -280 : d.kind === "concept" ? -40 : -95).distanceMax(380))
    .force("collide", forceCollide().radius(d => d.r + 5))
    .force("gx", forceX(d => galaxies.get(d.galaxy).ax).strength(.065))
    .force("gy", forceY(d => galaxies.get(d.galaxy).ay).strength(.065))
    .alphaDecay(.028).velocityDecay(.36);
  const stars = [];
  if (wantStars) for (let i = 0, total = mini ? 90 : nodes.length ? 260 : 620; i < total; i++) {
    const u = Math.random() * 2 - 1, angle = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = .72 + Math.random() * .3;
    stars.push({ x: s * Math.cos(angle) * r, y: u * r, z: s * Math.sin(angle) * r, a: .22 + Math.random() * .5, tw: .3 + Math.random(), phase: Math.random() * 6.28, size: Math.random() < .035 ? 1.6 : .7 });
  }
  const view = { x: 0, y: 0, k: 1 }, target = { x: 0, y: 0, k: 1 };
  let userMoved = false, hover = null, selected = focusId ? byId.get(focusId) : null, dragging = null, query = "", hudT = 0, hudFor = selected;
  const filter = { concepts: true, structure: true };
  const shown = n => n.kind === "concept" ? filter.concepts : filter.structure || n.kind === "lecture" || n.kind === "note";
  const toWorld = (x, y) => ({ x: (x - W / 2 - view.x) / view.k, y: (y - H / 2 - view.y) / view.k });
  function wake() { needsDraw = true; if (!destroyed && !document.hidden && raf === null) raf = requestAnimationFrame(frame); }
  function fit(instant = false) {
    const points = focusId ? nodes.filter(n => n.id === focusId || nbrs.get(focusId)?.has(n.id)) : nodes;
    if (!points.length || W < 1 || H < 1) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of points) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }
    const padX = mini ? Math.min(26, W * .15) : Math.min(W * .16, 145);
    const padTop = mini ? 26 : Math.min(125, H * .24), padBottom = mini ? 26 : Math.min(130, H * .23);
    const k = clamp(Math.min(Math.max(20, W - padX * 2) / (x1 - x0 || 1), Math.max(20, H - padTop - padBottom) / (y1 - y0 || 1)), .08, mini ? 1.6 : 2.2);
    Object.assign(target, { k, x: -(x0 + x1) / 2 * k, y: -(y0 + y1) / 2 * k + (padTop - padBottom) / 2 });
    if (instant) Object.assign(view, target);
    wake();
  }
  function hit(sx, sy) {
    const p = toWorld(sx, sy); let best = null, distance = Infinity;
    for (const n of nodes) {
      if (!shown(n) || n.vis < .3) continue;
      const d = Math.hypot(n.x + n.dx - p.x, n.y + n.dy - p.y);
      if (d < Math.max(n.r * 2.2, 14 / view.k) && d < distance) { best = n; distance = d; }
    }
    return best;
  }
  function select(n) {
    selected = n; if (n) { hudFor = n; hudT = 0; }
    onSelect(n, n ? [...nbrs.get(n.id)].map(id => byId.get(id)) : []); wake();
  }
  function releaseDrag() { if (dragging) { dragging.fx = null; dragging.fy = null; dragging = null; sim.alphaTarget(0); } }
  const pointers = new Map();
  let downAt = null, moved = false, pinch = null, multiGesture = false;
  listen(canvas, "pointerdown", e => {
    if (e.button !== undefined && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId); canvas.focus?.({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size > 1) {
      releaseDrag(); multiGesture = true; moved = true; downAt = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), k: target.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: target.x, y: target.y };
      return;
    }
    moved = false; multiGesture = false; downAt = { id: e.pointerId, x: e.offsetX, y: e.offsetY, vx: target.x, vy: target.y };
    if (!mini) { const n = hit(e.offsetX, e.offsetY); if (n) { dragging = n; n.fx = n.x; n.fy = n.y; sim.alphaTarget(.12).restart(); } }
    wake();
  });
  listen(canvas, "pointermove", e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size >= 2 && !mini) {
      const [a, b] = [...pointers.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .08, 6);
      const wx = (pinch.cx - W / 2 - pinch.x) / pinch.k, wy = (pinch.cy - H / 2 - pinch.y) / pinch.k;
      Object.assign(target, { k, x: cx - W / 2 - wx * k, y: cy - H / 2 - wy * k }); Object.assign(view, target); userMoved = true; wake(); return;
    }
    if (multiGesture) return;
    if (downAt && Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 5) moved = true;
    if (dragging && moved) { const p = toWorld(e.offsetX, e.offsetY); dragging.fx = p.x; dragging.fy = p.y; userMoved = true; wake(); return; }
    if (downAt && moved && !mini) { target.x = downAt.vx + e.offsetX - downAt.x; target.y = downAt.vy + e.offsetY - downAt.y; Object.assign(view, target); userMoved = true; wake(); return; }
    if (e.pointerType === "mouse") { const next = hit(e.offsetX, e.offsetY); if (next !== hover) { hover = next; wake(); } canvas.style.cursor = hover || mini ? "pointer" : "grab"; }
  });
  function finishPointer(e, cancelled = false) {
    if (!pointers.has(e.pointerId)) return;
    const was = dragging, allowTap = !cancelled && !multiGesture && !moved && downAt?.id === e.pointerId;
    pointers.delete(e.pointerId); releaseDrag();
    if (allowTap) {
      if (mini) onOpen(null);
      else { const n = was || hit(e.offsetX, e.offsetY); if (n && selected === n) onOpen(n); else select(n); }
    }
    pinch = null; downAt = null;
    if (!pointers.size) { multiGesture = false; moved = false; }
    wake();
  }
  listen(canvas, "pointerup", e => finishPointer(e));
  listen(canvas, "pointercancel", e => finishPointer(e, true));
  listen(canvas, "lostpointercapture", e => finishPointer(e, true));
  listen(canvas, "pointerleave", () => { hover = null; wake(); });
  listen(canvas, "wheel", e => {
    if (mini) return; e.preventDefault();
    const k = clamp(target.k * Math.exp(-e.deltaY * .0015), .08, 6), wx = (e.offsetX - W / 2 - target.x) / target.k, wy = (e.offsetY - H / 2 - target.y) / target.k;
    Object.assign(target, { k, x: e.offsetX - W / 2 - wx * k, y: e.offsetY - H / 2 - wy * k }); userMoved = true; wake();
  }, { passive: false });
  listen(canvas, "keydown", e => {
    if (mini) return;
    if (["+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "0", "Escape", "Enter"].includes(e.key)) e.preventDefault();
    if (e.key === "Escape") select(null);
    else if (e.key === "Enter" && selected) onOpen(selected);
    else if (e.key === "0") { userMoved = false; fit(); }
    else if (["+", "=", "-"].includes(e.key)) { const k = clamp(target.k * (e.key === "-" ? .8 : 1.25), .08, 6); target.x *= k / target.k; target.y *= k / target.k; target.k = k; userMoved = true; }
    else if (e.key.startsWith("Arrow")) { target.x += e.key === "ArrowLeft" ? 35 : e.key === "ArrowRight" ? -35 : 0; target.y += e.key === "ArrowUp" ? 35 : e.key === "ArrowDown" ? -35 : 0; userMoved = true; }
    wake();
  });
  function updatePreferences() {
    sky = ["sky", "light"].includes(document.documentElement.dataset.theme); palette = sky ? palettes.sky : palettes.space;
    reduceMotion = motionQuery.matches || document.documentElement.dataset.motion === "calm";
    if (reduceMotion) { nodes.forEach(n => { n.vis = shown(n) ? 1 : 0; }); }
    wake();
  }
  listen(window, "lumen-theme-changed", updatePreferences); listen(window, "lumen-motion-changed", updatePreferences);
  if (motionQuery.addEventListener) listen(motionQuery, "change", updatePreferences);
  listen(document, "visibilitychange", () => {
    if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; sim.stop(); }
    else { last = -Infinity; if (!settled || sim.alpha() > .01) sim.restart(); wake(); }
  });
  const ro = new ResizeObserver(() => {
    if (destroyed) return;
    const r = host.getBoundingClientRect(); W = Math.max(0, r.width); H = Math.max(0, r.height); dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (!userMoved) fit(true); wake();
  });
  ro.observe(host);
  function ring(x, y, r, color, width = 1, dash = [], a0 = 0, a1 = Math.PI * 2) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.arc(x, y, Math.max(0, r), a0, a1); ctx.strokeStyle = color; ctx.lineWidth = width / view.k; ctx.stroke(); ctx.setLineDash([]);
  }
  function text(str, x, y, { font = SANS, size = 11, weight = 400, color = rgba(palette.ink, .9), align = "left", base = "middle", spacing = 0 } = {}) {
    ctx.font = `${weight} ${size / view.k}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing / view.k}px`;
    ctx.fillText(str, x, y); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  function atmosphere(t) {
    if (!stars.length) return;
    const empty = !nodes.length, radius = empty ? Math.min(W * .3, H * .23, 174) : Math.max(W, H) * .61;
    const cx = W / 2 + view.x * .035, cy = empty ? H * .4 : H / 2 + view.y * .035;
    const rotation = reduceMotion ? .3 : t * .000023, cr = Math.cos(rotation), sr = Math.sin(rotation);
    if (empty && !mini) {
      const haloSize = radius * 1.9, gradient = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, haloSize);
      gradient.addColorStop(0, rgba(palette.halo, sky ? .07 : .10)); gradient.addColorStop(.5, rgba(palette.halo, sky ? .05 : .04)); gradient.addColorStop(1, rgba(palette.halo, 0));
      ctx.fillStyle = gradient; ctx.fillRect(cx - haloSize, cy - haloSize, haloSize * 2, haloSize * 2);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.38); ctx.scale(1.19, .34); ctx.beginPath(); ctx.arc(0, 0, radius * 1.07, 0, Math.PI * 2); ctx.strokeStyle = rgba(palette.star, sky ? .16 : .17); ctx.lineWidth = .7; ctx.stroke(); ctx.restore();
    }
    for (const s of stars) {
      const x = s.x * cr - s.z * sr, z = s.x * sr + s.z * cr, depth = clamp((z + 1.2) / 2.2, .05, 1);
      const twinkle = reduceMotion ? 1 : .8 + .2 * Math.sin(t * .0007 * s.tw + s.phase);
      const px = cx + x * radius, py = cy + s.y * radius;
      ctx.globalAlpha = s.a * depth * twinkle * (mini ? .55 : empty ? 1 : sky ? .42 : .6);
      ctx.fillStyle = s.size > 1 ? palette.bridge : palette.dust;
      ctx.fillRect(px, py, s.size, s.size);
      if (empty && s.size > 1 && depth > .65) { ctx.globalAlpha *= .5; const size = 8; ctx.drawImage(glow(palette.halo), px - size, py - size, size * 2, size * 2); }
    }
    ctx.globalAlpha = 1;
  }
  function frame(time) {
    raf = null; if (destroyed || document.hidden) return;
    if (W < 1 || H < 1) return;
    const frameInterval = W < 650 || nodes.length > 450 ? 1000 / 30 : 1000 / 60;
    if (!needsDraw && !reduceMotion && time - last < frameInterval - 1) { raf = requestAnimationFrame(frame); return; }
    const t = time - t0; last = time; needsDraw = false;
    if (!settled && sim.alpha() < .06) { settled = true; if (!userMoved) fit(); }
    const e = reduceMotion ? 1 : .12;
    view.x += (target.x - view.x) * e; view.y += (target.y - view.y) * e; view.k += (target.k - view.k) * e;
    const active = selected || hover, q = query.toLowerCase(), lit = active ? new Set([active.id, ...nbrs.get(active.id)]) : null;
    for (const n of nodes) {
      const alive = reduceMotion || t > n.born ? 1 : 0, want = !shown(n) ? 0 : lit ? lit.has(n.id) ? 1 : .13 : q ? n.title.toLowerCase().includes(q) ? 1 : .13 : 1;
      n.vis += (want * alive - n.vis) * (reduceMotion ? 1 : .11);
      const amp = reduceMotion ? 0 : n.kind === "concept" ? 1.3 : .65;
      n.dx = Math.sin(t * .00028 + n.phase) * amp; n.dy = Math.cos(t * .00024 + n.phase * 1.3) * amp;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); atmosphere(t);
    ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.scale(view.k, view.k);
    for (const g of galaxies.values()) { g.sx = 0; g.sy = 0; g.n = 0; g.far = 0; }
    for (const n of nodes) if (n.vis > .05) { const g = galaxies.get(n.galaxy); g.sx += n.x; g.sy += n.y; g.n++; }
    for (const g of galaxies.values()) if (g.n) { g.cx += (g.sx / g.n - g.cx) * .1; g.cy += (g.sy / g.n - g.cy) * .1; }
    for (const n of nodes) if (n.vis > .05) { const g = galaxies.get(n.galaxy); g.far = Math.max(g.far, Math.hypot(n.x - g.cx, n.y - g.cy)); }
    for (const g of galaxies.values()) {
      if (!g.n) continue; g.rad += (g.far + 28 - g.rad) * (reduceMotion ? 1 : .1);
      if (mini || g.n < 2) continue;
      const color = colorOf({ galaxy: g.id }), dim = active && active.galaxy !== g.id ? .32 : 1, spin = (reduceMotion ? 0 : t * .000037) + g.spin;
      ring(g.cx, g.cy, g.rad, rgba(color, .12 * dim)); ring(g.cx, g.cy, g.rad + 7 / view.k, rgba(color, .20 * dim), 1, [1.5 / view.k, 8 / view.k], spin, spin + Math.PI * .7);
      ring(g.cx, g.cy, g.rad + 7 / view.k, rgba(color, .4 * dim), 1, [], spin + Math.PI * 1.15, spin + Math.PI * 1.3);
      const lr = g.rad + 15 / view.k, lx = g.cx + Math.cos(-2.35) * lr, ly = g.cy + Math.sin(-2.35) * lr;
      text(g.title.toUpperCase(), lx, ly, { font: MONO, size: 9, color: rgba(color, .84 * dim), align: "right", spacing: 1.4 });
      text(`${g.n} STARS`, lx, ly + 13 / view.k, { font: MONO, size: 8, color: rgba(palette.muted, .8 * dim), align: "right", spacing: 1 });
    }
    ctx.globalCompositeOperation = sky ? "source-over" : "lighter";
    for (const l of links) {
      const s = l.source, d = l.target, highlighted = active && (s === active || d === active), want = Math.min(s.vis, d.vis);
      l.vis += (want - l.vis) * (reduceMotion ? 1 : .15); if (l.vis < .02) continue;
      const sx = s.x + s.dx, sy = s.y + s.dy, tx = d.x + d.dx, ty = d.y + d.dy;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      if (l.type === "mentions") ctx.quadraticCurveTo((sx + tx) / 2 + (ty - sy) * .13, (sy + ty) / 2 - (tx - sx) * .13, tx, ty); else ctx.lineTo(tx, ty);
      ctx.strokeStyle = rgba(colorOf(s.kind === "concept" ? d : s), (highlighted ? .8 : palette.edge) * l.vis); ctx.lineWidth = (highlighted ? 1.15 : .65) / view.k; ctx.stroke();
    }
    for (const n of nodes) {
      if (n.vis < .02) continue;
      const c = colorOf(n), x = n.x + n.dx, y = n.y + n.dy, birth = reduceMotion ? 1 : ease((t - n.born) / 900), pulse = reduceMotion ? 1 : 1 + Math.sin(t * .0009 + n.phase) * .05;
      const r = Math.max(n.r, 1.5 / view.k) * birth * pulse; if (r <= 0) continue;
      const size = r * (n === active ? 13 : n.kind === "section" ? 11 : 7);
      ctx.globalAlpha = n.vis * (sky ? .45 : .8); ctx.drawImage(glow(c), x - size, y - size, size * 2, size * 2); ctx.globalAlpha = n.vis;
      if (n.kind === "lecture" || n.kind === "module") ring(x, y, r * 1.5, rgba(c, .84), 1);
      ctx.beginPath(); ctx.arc(x, y, r * (n.kind === "concept" ? .68 : .85), 0, Math.PI * 2); ctx.fillStyle = sky ? c : palette.core; ctx.fill();
      if (n.kind === "section") {
        ring(x, y, r * 2.5, rgba(c, .28));
        if (n === active) { ctx.beginPath(); ctx.moveTo(x - r * 3.4, y); ctx.lineTo(x + r * 3.4, y); ctx.moveTo(x, y - r * 3.4); ctx.lineTo(x, y + r * 3.4); ctx.strokeStyle = rgba(c, .25); ctx.lineWidth = .5 / view.k; ctx.stroke(); }
      }
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    if (hudFor && !mini) {
      hudT += ((selected === hudFor ? 1 : 0) - hudT) * (reduceMotion ? 1 : .12);
      if (hudT > .01) {
        const n = hudFor, color = colorOf(n), x = n.x + n.dx, y = n.y + n.dy, k = ease(hudT), base = Math.max(n.r * 2.2, 9 / view.k), spin = reduceMotion ? 0 : t * .00022;
        ctx.globalAlpha = k;
        ring(x, y, base + 6 / view.k * k, rgba(palette.ink, .65));
        ring(x, y, base + 17 / view.k * k, rgba(palette.ink, .27), .7, [1 / view.k, 5 / view.k], spin, spin + Math.PI * 1.5);
        ring(x, y, base + 17 / view.k * k, rgba(color, .8), 1.2, [], -spin, -spin + Math.PI * .38);
        ring(x, y, base + 29 / view.k * k, rgba(color, .18), .7, [], spin * .5 + 2.2, spin * .5 + 3.8);
        // Keep the canvas readout modest; the adjacent inspector is the full, readable label.
        const direction = x * view.k + W / 2 + view.x > W - 240 ? -1 : 1;
        const lx = x + direction * (base + 45 / view.k), ly = y - (base + 16 / view.k);
        ctx.beginPath(); ctx.moveTo(x + direction * base, y - base * .5); ctx.lineTo(lx, ly); ctx.strokeStyle = rgba(palette.ink, .4); ctx.lineWidth = .7 / view.k; ctx.stroke();
        text(n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title, lx + direction * 6 / view.k, ly - 3 / view.k, { size: 12, weight: 500, align: direction < 0 ? "right" : "left" });
        text(`${n.kind.toUpperCase()} · ${nbrs.get(n.id).size} LINKS`, lx + direction * 6 / view.k, ly + 12 / view.k, { font: MONO, size: 8, color: rgba(color, .9), align: direction < 0 ? "right" : "left", spacing: .8 });
      }
    }
    for (const n of nodes) {
      if (n.vis < .35 || n === selected) continue;
      const big = ["section", "module", "lecture"].includes(n.kind);
      const show = mini ? n.kind === "section" : lit ? lit.has(n.id) : q ? n.title.toLowerCase().includes(q) : big ? view.k > .45 : view.k > (W < 600 ? 1.9 : 1.15);
      if (!show) continue;
      const x = n.x + n.dx, y = n.y + n.dy, offset = Math.max(n.r * 2, 6 / view.k) + 4 / view.k;
      ctx.globalAlpha = n.vis;
      if (n.kind === "section") text(n.title.toUpperCase(), x, y + offset, { font: MONO, size: 9.5, weight: 500, color: rgba(colorOf(n), .95), align: "center", base: "top", spacing: 1.2 });
      else { const left = !big && x < (galaxies.get(n.galaxy)?.cx || 0) - 4; text(n.title.length > 34 ? n.title.slice(0, 32) + "…" : n.title, x + (left ? -offset : offset), y, { size: big ? 11 : 10, weight: big ? 500 : 400, align: left ? "right" : "left", color: rgba(big ? palette.ink : palette.muted, .95) }); }
    }
    ctx.globalAlpha = 1;
    const movingView = Math.abs(target.x - view.x) + Math.abs(target.y - view.y) + Math.abs(target.k - view.k) > .02;
    if (raf === null && (!reduceMotion || !settled || movingView)) raf = requestAnimationFrame(frame);
  }
  sim.on("tick.lumen", wake);
  sim.on("end.lumen", () => { settled = true; if (!userMoved) fit(); wake(); });
  updatePreferences();
  if (document.hidden) sim.stop();
  return {
    setFilter(f) { Object.assign(filter, f); if (selected && !shown(selected)) select(null); wake(); },
    setQuery(s) { query = String(s || ""); wake(); },
    focus(id) { const n = byId.get(id); if (!n) return; select(n); const k = Math.max(target.k, 1.6); Object.assign(target, { k, x: -n.x * k, y: -n.y * k }); userMoved = true; wake(); },
    clear() { select(null); },
    fit() { userMoved = false; fit(); },
    destroy() { if (destroyed) return; destroyed = true; if (raf !== null) cancelAnimationFrame(raf); raf = null; sim.on("tick.lumen", null).on("end.lumen", null).stop(); releaseDrag(); ro.disconnect(); cleanups.forEach(fn => fn()); canvas.remove(); },
  };
}
