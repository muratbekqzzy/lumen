// Lumen universe - a living, glowing knowledge graph on canvas (d3-force layout).
// Sections become galaxies; lectures, notes and concepts are stars; shared concepts bridge galaxies.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from "https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KIND_R = { section: 5.2, module: 3.6, lecture: 3.4, note: 2.4, concept: 1.7 };
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Inter", -apple-system, sans-serif';
const DEFAULT_STAR = "#dfe6ef", CONCEPT = "#b9bec6", BRIDGE = "#ffd27a";

function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// pre-rendered soft glow sprites, one per colour
const glowCache = new Map();
function glow(hex) {
  if (glowCache.has(hex)) return glowCache.get(hex);
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), [r, gg, b] = rgb(hex);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); grd.addColorStop(0.18, `rgba(${r},${gg},${b},0.35)`);
  grd.addColorStop(0.45, `rgba(${r},${gg},${b},0.08)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowCache.set(hex, c); return c;
}

export function mountGraph(host, data, opts = {}) {
  const { mini = false, onOpen = () => {}, onSelect = () => {}, focusId = null, stars: wantStars = true } = opts;
  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const dpr = Math.min(devicePixelRatio || 1, 2);

  // ---------- data
  const nodes = data.nodes.map((n, i) => ({ ...n, i, vis: 0, born: reduceMotion ? 0 : 120 + i * 14,
    r: (KIND_R[n.kind] || 2) + Math.min(5, Math.sqrt(n.degree || 0) * (n.kind === "concept" ? 0.55 : 0.35)),
    phase: Math.random() * Math.PI * 2, dx: 0, dy: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = data.edges.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ ...e, vis: 0 }));
  const nbrs = new Map(nodes.map((n) => [n.id, new Set()]));
  links.forEach((l) => { nbrs.get(l.source).add(l.target); nbrs.get(l.target).add(l.source); });

  // galaxy = section (or "inbox"); concepts join the galaxy most of their neighbours belong to
  for (const n of nodes) n.galaxy = n.section || (n.kind !== "concept" ? "inbox" : null);
  for (const n of nodes) if (!n.galaxy) {
    const count = {}; nbrs.get(n.id).forEach((id) => { const g = byId.get(id).galaxy; if (g) count[g] = (count[g] || 0) + 1; });
    n.galaxy = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "inbox";
  }
  const sectionInfo = new Map();
  nodes.filter((n) => n.kind === "section").forEach((s) => sectionInfo.set(s.id, { title: s.title, color: s.color || DEFAULT_STAR }));
  const galaxyIds = [...new Set(nodes.map((n) => n.galaxy))];
  const galaxies = new Map(galaxyIds.map((g, i) => {
    const info = sectionInfo.get(g) || { title: g === "inbox" ? "Inbox" : "Unsorted", color: DEFAULT_STAR };
    const K = galaxyIds.length, ang = (i / K) * Math.PI * 2 - Math.PI / 2, R = K > 1 ? 150 + 70 * Math.sqrt(K) : 0;
    return [g, { id: g, ...info, ax: Math.cos(ang) * R, ay: Math.sin(ang) * R, cx: Math.cos(ang) * R, cy: Math.sin(ang) * R, rad: 40, n: 0, spin: Math.random() * 6 }];
  }));
  const colorOf = (n) => n.kind === "concept" ? (n.bridges > 1 ? BRIDGE : CONCEPT) : (n.color || galaxies.get(n.galaxy)?.color || DEFAULT_STAR);

  // ---------- layout
  const sim = forceSimulation(nodes)
    .force("link", forceLink(links).id((d) => d.id).distance((l) => l.type === "contains" ? 34 : 52).strength((l) => l.type === "contains" ? 0.8 : 0.3))
    .force("charge", forceManyBody().strength((d) => d.kind === "section" ? -260 : d.kind === "concept" ? -38 : -90).distanceMax(380))
    .force("collide", forceCollide().radius((d) => d.r + 3.5))
    .force("gx", forceX((d) => galaxies.get(d.galaxy).ax).strength(0.07))
    .force("gy", forceY((d) => galaxies.get(d.galaxy).ay).strength(0.07))
    .alphaDecay(0.022).velocityDecay(0.3);
  nodes.forEach((n, i) => { const g = galaxies.get(n.galaxy), a = i * 2.399, d = 4 + Math.sqrt(i) * 6; n.x = g.ax + Math.cos(a) * d; n.y = g.ay + Math.sin(a) * d; });

  // ---------- starfield (a faint sphere of dust behind your knowledge)
  const stars = [];
  if (wantStars) {
    const N = mini ? 160 : 520;
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const rad = 0.55 + Math.pow(Math.random(), 0.6) * 0.5;
      stars.push({ x: s * Math.cos(th) * rad, y: u * rad, z: s * Math.sin(th) * rad, a: 0.25 + Math.random() * 0.6, tw: 0.4 + Math.random() * 1.6, p: Math.random() * 6.28, sz: Math.random() < 0.08 ? 1.3 : 0.7 });
    }
  }

  // ---------- view (eased pan/zoom)
  const view = { x: 0, y: 0, k: 1 }, target = { x: 0, y: 0, k: 1 };
  let userMoved = false;
  const toWorld = (sx, sy) => ({ x: (sx - W / 2 - view.x) / view.k, y: (sy - H / 2 - view.y) / view.k });
  function fit(instant = false) {
    const pts = focusId ? nodes.filter((n) => n.id === focusId || nbrs.get(focusId)?.has(n.id)) : nodes;
    if (!pts.length || !W) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    const padX = mini ? 30 : W < 600 ? 60 : 160, padY = mini ? 30 : W < 600 ? 190 : 120;
    const k = Math.min(mini ? 1.6 : 2.2, Math.max(0.2, Math.min((W - padX * 2) / (x1 - x0 || 1), (H - padY * 2) / (y1 - y0 || 1))));
    Object.assign(target, { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k + (mini ? 0 : W < 600 ? 30 : 10) });
    if (instant) Object.assign(view, target);
  }

  // ---------- interaction
  let hover = null, selected = focusId ? byId.get(focusId) : null, dragging = null, query = "";
  const filter = { concepts: true, structure: true };
  let hudT = 0, hudFor = selected;
  const shown = (n) => n.kind === "concept" ? filter.concepts : (filter.structure || n.kind === "lecture" || n.kind === "note");
  function hit(sx, sy) {
    const p = toWorld(sx, sy);
    let best = null, bd = Infinity;
    for (const n of nodes) {
      if (!shown(n) || n.vis < 0.3) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < Math.max(n.r * 2.2, 14 / view.k) && d < bd) { best = n; bd = d; }
    }
    return best;
  }
  function select(n) {
    selected = n; if (n) { hudFor = n; hudT = 0; }
    onSelect(n, n ? [...nbrs.get(n.id)].map((id) => byId.get(id)) : []);
  }
  const pts = new Map();
  let downAt = null, moved = false, pinch = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved = false; downAt = { x: e.offsetX, y: e.offsetY, vx: target.x, vy: target.y };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: target.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: target.x, y: target.y };
      dragging = null; return;
    }
    if (mini) return;
    const n = hit(e.offsetX, e.offsetY);
    if (n) { dragging = n; n.fx = n.x; n.fy = n.y; sim.alphaTarget(0.15).restart(); }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const k = Math.min(6, Math.max(0.15, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      const wx = (pinch.cx - W / 2 - pinch.x) / pinch.k, wy = (pinch.cy - H / 2 - pinch.y) / pinch.k;
      Object.assign(target, { k, x: pinch.cx - W / 2 - wx * k, y: pinch.cy - H / 2 - wy * k });
      Object.assign(view, target); userMoved = true; return;
    }
    if (downAt && Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 4) moved = true;
    if (dragging) { const p = toWorld(e.offsetX, e.offsetY); dragging.fx = p.x; dragging.fy = p.y; return; }
    if (downAt && moved && !mini) { target.x = downAt.vx + (e.offsetX - downAt.x); target.y = downAt.vy + (e.offsetY - downAt.y); view.x = target.x; view.y = target.y; userMoved = true; return; }
    if (e.pointerType === "mouse") { hover = hit(e.offsetX, e.offsetY); canvas.style.cursor = hover || mini ? "pointer" : "grab"; }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (dragging) { dragging.fx = null; dragging.fy = null; sim.alphaTarget(0); }
    const was = dragging; dragging = null;
    if (!downAt) return;
    if (!moved) {
      if (mini) onOpen(null);
      else { const n = was || hit(e.offsetX, e.offsetY); if (n && selected === n) onOpen(n); else select(n); }
    }
    downAt = null;
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", () => { hover = null; });
  canvas.addEventListener("dblclick", (e) => { const n = hit(e.offsetX, e.offsetY); if (n) onOpen(n); });
  canvas.addEventListener("wheel", (e) => {
    if (mini) return;
    e.preventDefault();
    const k = Math.min(6, Math.max(0.15, target.k * Math.exp(-e.deltaY * 0.0015)));
    const wx = (e.offsetX - W / 2 - target.x) / target.k, wy = (e.offsetY - H / 2 - target.y) / target.k;
    Object.assign(target, { k, x: e.offsetX - W / 2 - wx * k, y: e.offsetY - H / 2 - wy * k }); userMoved = true;
  }, { passive: false });

  const ro = new ResizeObserver(() => {
    const r = host.getBoundingClientRect(); W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (!userMoved) fit(view.k === 1 && view.x === 0);
  });
  ro.observe(host);

  // ---------- drawing helpers
  function ring(x, y, r, color, width, dash = null, a0 = 0, a1 = Math.PI * 2) {
    ctx.beginPath(); ctx.setLineDash(dash || []); ctx.arc(x, y, r, a0, a1);
    ctx.strokeStyle = color; ctx.lineWidth = width / view.k; ctx.stroke(); ctx.setLineDash([]);
  }
  function text(str, x, y, { font = SANS, size = 11, weight = 400, color = "rgba(235,238,242,.9)", align = "left", base = "middle", spacing = 0 } = {}) {
    ctx.font = `${weight} ${size / view.k}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
    if (spacing && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing / view.k}px`;
    ctx.fillText(str, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  // ---------- frame
  let raf, t0 = performance.now(), last = t0, settled = false;
  function frame(now) {
    const t = now - t0, dt = Math.min(50, now - last); last = now;
    if (!settled && sim.alpha() < 0.06) { settled = true; if (!userMoved) fit(); }
    else if (!settled && !userMoved && t < 2600 && Math.floor(t / 300) !== Math.floor((t - dt) / 300)) fit();
    const e = reduceMotion ? 1 : 0.12;
    view.x += (target.x - view.x) * e; view.y += (target.y - view.y) * e; view.k += (target.k - view.k) * e;

    const a = selected || hover, q = query.toLowerCase();
    const lit = a ? new Set([a.id, ...nbrs.get(a.id)]) : null;
    for (const n of nodes) {
      const alive = t > n.born ? 1 : 0;
      const want = !shown(n) ? 0 : lit ? (lit.has(n.id) ? 1 : 0.12) : q ? (n.title.toLowerCase().includes(q) ? 1 : 0.12) : 1;
      n.vis += (want * alive - n.vis) * (reduceMotion ? 1 : 0.09);
      const amp = reduceMotion ? 0 : (n.kind === "concept" ? 1.4 : 0.8); // gentle drift: the universe breathes
      n.dx = Math.sin(t * 0.00037 + n.phase) * amp; n.dy = Math.cos(t * 0.00029 + n.phase * 1.3) * amp;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // starfield (screen space, slow rotation + parallax)
    if (stars.length) {
      const rot = reduceMotion ? 0 : t * 0.000018, R = Math.max(W, H) * 0.62, cx = W / 2 + view.x * 0.06, cy = H / 2 + view.y * 0.06;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      ctx.fillStyle = "#e9eef5";
      for (const s of stars) {
        const x = s.x * cr - s.z * sr, z = s.x * sr + s.z * cr;
        const depth = (z + 1.2) / 2.2;
        const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.p);
        ctx.globalAlpha = s.a * depth * tw * (mini ? 0.7 : 1);
        ctx.fillRect(cx + x * R, cy + s.y * R, s.sz, s.sz);
      }
      ctx.globalAlpha = 1;
    }

    ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.scale(view.k, view.k);

    // galaxies: thin instrument rings around each section's cluster
    for (const g of galaxies.values()) { g.sx = 0; g.sy = 0; g.n = 0; }
    for (const n of nodes) { if (n.vis < 0.05) continue; const g = galaxies.get(n.galaxy); g.sx += n.x; g.sy += n.y; g.n++; }
    for (const g of galaxies.values()) {
      if (!g.n) continue;
      g.cx += (g.sx / g.n - g.cx) * 0.08; g.cy += (g.sy / g.n - g.cy) * 0.08;
      let far = 0; for (const n of nodes) if (n.galaxy === g.id && n.vis > 0.05) far = Math.max(far, Math.hypot(n.x - g.cx, n.y - g.cy));
      g.rad += (far + 26 - g.rad) * 0.08;
      if (mini || g.n < 2) continue;
      const dim = a && a.galaxy !== g.id ? 0.35 : 1, spin = (reduceMotion ? 0 : t * 0.00005) + g.spin;
      ring(g.cx, g.cy, g.rad, rgba(g.color, 0.10 * dim), 1);
      ring(g.cx, g.cy, g.rad + 7 / view.k, rgba(g.color, 0.16 * dim), 1, [2 / view.k, 7 / view.k], spin, spin + Math.PI * 0.6);
      ring(g.cx, g.cy, g.rad + 7 / view.k, rgba(g.color, 0.28 * dim), 1.4, null, spin + Math.PI * 1.1, spin + Math.PI * 1.22);
      for (let i = 0; i < 4; i++) { // cardinal ticks
        const ang = i * Math.PI / 2 + spin * 0.3, r0 = g.rad - 3 / view.k, r1 = g.rad + 3 / view.k;
        ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(ang) * r0, g.cy + Math.sin(ang) * r0); ctx.lineTo(g.cx + Math.cos(ang) * r1, g.cy + Math.sin(ang) * r1);
        ctx.strokeStyle = rgba(g.color, 0.35 * dim); ctx.lineWidth = 1 / view.k; ctx.stroke();
      }
      const la = -2.35, lr = g.rad + 18 / view.k, lx = g.cx + Math.cos(la) * lr, ly = g.cy + Math.sin(la) * lr - 6 / view.k;
      text(g.title.toUpperCase(), lx, ly, { font: MONO, size: 10, weight: 500, color: rgba(g.color, 0.75 * dim), align: "right", spacing: 1.5 });
      text(`${String(g.n).padStart(2, "0")} STARS`, lx, ly + 13 / view.k, { font: MONO, size: 8.5, color: `rgba(200,205,212,${0.4 * dim})`, align: "right", spacing: 1 });
    }

    // edges (additive, hairline)
    ctx.globalCompositeOperation = "lighter";
    for (const l of links) {
      const s = l.source, d = l.target, on = a && (s === a || d === a);
      const want = on ? 1 : Math.min(s.vis, d.vis);
      l.vis += (want - l.vis) * 0.12;
      if (l.vis < 0.02) continue;
      const sx = s.x + s.dx, sy = s.y + s.dy, tx = d.x + d.dx, ty = d.y + d.dy;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      if (l.type === "mentions") { const mx = (sx + tx) / 2 + (ty - sy) * 0.1, my = (sy + ty) / 2 - (tx - sx) * 0.1; ctx.quadraticCurveTo(mx, my, tx, ty); }
      else ctx.lineTo(tx, ty);
      const c = colorOf(s.kind === "concept" ? d : s);
      ctx.strokeStyle = rgba(c, (on ? 0.75 : l.type === "contains" ? 0.45 : 0.36) * l.vis);
      ctx.lineWidth = (on ? 1.3 : 1) / view.k;
      ctx.stroke();
    }

    // stars (nodes): glow sprite + bright core
    for (const n of nodes) {
      if (n.vis < 0.02) continue;
      const c = colorOf(n), x = n.x + n.dx, y = n.y + n.dy;
      const birth = reduceMotion ? 1 : ease((t - n.born) / 700);
      const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 0.0016 + n.phase) * 0.06;
      const r = Math.max(n.r, (n.kind === "concept" ? 1.2 : 1.8) / view.k) * birth * pulse;
      if (r <= 0) continue;
      const gsz = r * (n === a ? 11 : n.kind === "concept" ? 6 : 8);
      ctx.globalAlpha = n.vis * (n.kind === "concept" ? 0.55 : 0.8);
      ctx.drawImage(glow(c), x - gsz, y - gsz, gsz * 2, gsz * 2);
      ctx.globalAlpha = n.vis;
      if (n.kind === "lecture" || n.kind === "module") {
        ring(x, y, r * 1.55, rgba(c, 0.85), 1.1);
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, r * (n.kind === "concept" ? 0.75 : 0.85), 0, Math.PI * 2);
        ctx.fillStyle = n.kind === "concept" && n.bridges <= 1 ? "rgba(235,238,242,.9)" : "#fff"; ctx.fill();
      }
      if (n.kind === "section") ring(x, y, r * 2.6, rgba(c, 0.35), 1);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // HUD around the selected star
    if (hudFor && !mini) {
      hudT += ((selected === hudFor ? 1 : 0) - hudT) * (reduceMotion ? 1 : 0.1);
      if (hudT > 0.01) {
        const n = hudFor, c = colorOf(n), x = n.x + n.dx, y = n.y + n.dy, k = ease(hudT);
        const base = Math.max(n.r * 2.2, 9 / view.k), spin = reduceMotion ? 0 : t * 0.0004;
        ctx.globalAlpha = k;
        ring(x, y, base + 6 / view.k * k, "rgba(240,244,248,.75)", 1);
        ring(x, y, base + 16 / view.k * k, "rgba(240,244,248,.28)", 1, [1.5 / view.k, 5 / view.k], spin, spin + Math.PI * 1.5);
        ring(x, y, base + 16 / view.k * k, rgba(c, 0.9), 1.6, null, -spin * 1.6, -spin * 1.6 + Math.PI * 0.32);
        ring(x, y, base + 30 / view.k * k, "rgba(240,244,248,.12)", 1, null, spin * 0.5 + 2.2, spin * 0.5 + 3.4);
        for (let i = 0; i < 12; i++) { // fine tick ring
          const ang = i * Math.PI / 6 - spin * 0.5, r0 = base + 22 / view.k, r1 = r0 + (i % 3 === 0 ? 5 : 2.5) / view.k;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
          ctx.strokeStyle = "rgba(240,244,248,.35)"; ctx.lineWidth = 1 / view.k; ctx.stroke();
        }
        // leader line to the readout
        const lx0 = x + (base + 16 / view.k) * Math.cos(-0.7), ly0 = y + (base + 16 / view.k) * Math.sin(-0.7);
        const lx1 = lx0 + 26 / view.k * k, ly1 = ly0 - 22 / view.k * k, lx2 = lx1 + 34 / view.k * k;
        ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.lineTo(lx2, ly1);
        ctx.strokeStyle = "rgba(240,244,248,.6)"; ctx.lineWidth = 1 / view.k; ctx.stroke();
        ctx.beginPath(); ctx.arc(lx0, ly0, 1.8 / view.k, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
        text(n.title, lx2 + 6 / view.k, ly1 - 1 / view.k, { size: 13, weight: 500, color: "rgba(245,247,250,.96)" });
        const meta = `${(n.kind || "").toUpperCase()} · ${String(nbrs.get(n.id).size).padStart(2, "0")} LINKS${n.bridges > 1 ? " · BRIDGE" : ""}`;
        text(meta, lx2 + 6 / view.k, ly1 + 14 / view.k, { font: MONO, size: 9, color: rgba(c, 0.85), spacing: 1 });
        ctx.globalAlpha = 1;
      }
    }

    // labels
    for (const n of nodes) {
      if (n.vis < 0.35 || n === selected) continue;
      const big = n.kind === "section" || n.kind === "module" || n.kind === "lecture";
      const show = mini ? n.kind === "section" : lit ? lit.has(n.id) : q ? n.title.toLowerCase().includes(q) : (big ? view.k > 0.5 : view.k > (W < 600 ? 1.9 : 1.15));
      if (!show) continue;
      const x = n.x + n.dx, y = n.y + n.dy, off = Math.max(n.r * 2, 6 / view.k) + 3 / view.k;
      ctx.globalAlpha = Math.min(1, n.vis);
      if (n.kind === "section") text(n.title.toUpperCase(), x, y + off + 4 / view.k, { font: MONO, size: 10, weight: 500, color: rgba(colorOf(n), 0.9), align: "center", base: "top", spacing: 1.5 });
      else {
        const left = !big && x < (galaxies.get(n.galaxy)?.cx ?? 0) - 4; // labels point away from their galaxy's core
        text(n.title.length > 34 ? n.title.slice(0, 32) + "…" : n.title, left ? x - off : x + off, y,
          { size: big ? 11.5 : 10.5, weight: big ? 500 : 400, align: left ? "right" : "left", color: big ? "rgba(240,243,247,.9)" : "rgba(200,206,214,.75)" });
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setFilter(f) { Object.assign(filter, f); },
    setQuery(s) { query = s || ""; },
    focus(id) {
      const n = byId.get(id); if (!n) return;
      select(n);
      const k = Math.max(target.k, 1.6); Object.assign(target, { k, x: -n.x * k, y: -n.y * k }); userMoved = true;
    },
    clear() { select(null); },
    fit() { userMoved = false; fit(); },
    destroy() { cancelAnimationFrame(raf); sim.stop(); ro.disconnect(); canvas.remove(); },
  };
}
