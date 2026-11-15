// Lumen's knowledge universe. Library records are the stars; ambient dust is decorative.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from "./force.js";
import { galaxyLayout, overviewCamera, rotatePoint, screenPoint, worldPoint } from "./universe.js";

const KIND_R = { section: 2.9, module: 1.8, lecture: 1.65, note: 1.25, concept: .95 };
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
  space: { ink: "#fff1fc", muted: "#c7acd9", star: "#f7bde9", concept: "#d6c3ff", bridge: "#ffe1d9", dust: "#e6d3ff", core: "#fffaf5", halo: "#d5a8ff", edge: .07 },
  sky: { ink: "#573161", muted: "#89618a", star: "#cf91da", concept: "#ad93db", bridge: "#b86db5", dust: "#be96d4", core: "#fffafc", halo: "#bd91e7", edge: .095 },
};
const galaxyCache=new Map();
function randomFrom(seed){let value=2166136261;for(const char of String(seed))value=Math.imul(value^char.charCodeAt(0),16777619);return()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};}
function galaxySprite(sky,index){
 const key=(sky?'sky':'space')+(index%2);if(galaxyCache.has(key))return galaxyCache.get(key);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const g=canvas.getContext('2d'),random=randomFrom(key);
 const colors=sky?(index%2?['#b994e5','#e7a8d3','#c6b6ec']:['#df9fc8','#b990e6','#eac0d9']):(index%2?['#ceb5ff','#ffc9e6','#d0dfff']:['#ffc4e4','#d0b5ff','#ffe6db']);
 g.globalCompositeOperation=sky?'source-over':'lighter';
 for(let j=0;j<3;j++){const r=154-j*24,gradient=g.createRadialGradient(192+j*7,192-j*7,0,192,192,r);gradient.addColorStop(0,rgba(colors[j],sky?.16:.12));gradient.addColorStop(.45,rgba(colors[j],sky?.08:.055));gradient.addColorStop(1,rgba(colors[j],0));g.fillStyle=gradient;g.fillRect(0,0,384,384);}
 for(let i=0;i<620;i++){
  const r=Math.pow(random(),.64)*158,arm=i%2*Math.PI,a=r*.033+arm+(random()-.5)*.68;
  const x=192+Math.cos(a)*r+(random()-.5)*13,y=192+Math.sin(a)*r*.58+(random()-.5)*11,size=random()>.97?1.5:.45+random()*.55;
  g.globalAlpha=(1-r/240)*(.2+random()*.55);g.fillStyle=colors[i%3];g.fillRect(x,y,size,size);
 }
 g.globalAlpha=1;const core=g.createRadialGradient(192,192,0,192,192,34);core.addColorStop(0,rgba('#fff7ee',.88));core.addColorStop(.17,rgba('#ffe4f2',.4));core.addColorStop(.55,rgba(colors[0],.13));core.addColorStop(1,rgba(colors[1],0));g.fillStyle=core;g.fillRect(152,152,80,80);
 galaxyCache.set(key,canvas);return canvas;
}
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
  canvas.setAttribute("aria-label", mini ? "Knowledge constellation preview" : "Interactive galaxy. Drag to move, pinch to zoom and twist to rotate. Shift-drag rotates with a mouse. Plus and minus zoom, 0 returns home, Escape clears selection, Enter opens a selected star.");
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
  const galaxies=galaxyLayout(nodes);
  for(const g of galaxies.values())Object.assign(g,{...sectionInfo.get(g.id),cx:g.ax,cy:g.ay,rad:g.footprint,n:0,spin:randomFrom(g.id)()*Math.PI,core:nodes.find(node=>node.kind==='section'&&node.id===g.id)});
  function colorOf(n) {
    if (n.kind === "concept") return n.bridges > 1 ? palette.bridge : palette.concept;
    const original=n.color||galaxies.get(n.galaxy)?.color||palette.star,base=rgb(galaxies.get(n.galaxy)?.index%2?'#c9bbff':palette.star);
    return '#'+rgb(original).map((value,i)=>Math.round(base[i]*.78+value*.22).toString(16).padStart(2,'0')).join('');
  }
  const localCounts=new Map();nodes.forEach(n=>{const g=galaxies.get(n.galaxy),i=localCounts.get(g.id)||0;localCounts.set(g.id,i+1);const a=i*2.399,d=n.kind==='section'?0:12+Math.sqrt(i)*10;n.x=g.ax+Math.cos(a)*d;n.y=g.ay+Math.sin(a)*d*.7;});
  const sim = forceSimulation(nodes)
    .force("link", forceLink(links).id(d => d.id).distance(l => l.type === "contains" ? 32 : 48).strength(l => l.type === "contains" ? .55 : .15))
    .force("charge", forceManyBody().strength(d => d.kind === "section" ? -90 : d.kind === "concept" ? -18 : -42).distanceMax(180))
    .force("collide", forceCollide().radius(d => d.r + 5))
    .force("gx", forceX(d => galaxies.get(d.galaxy).ax).strength(d=>d.kind==='section'?.17:.105))
    .force("gy", forceY(d => galaxies.get(d.galaxy).ay).strength(d=>d.kind==='section'?.17:.105))
    .alphaDecay(.028).velocityDecay(.36);
  const stars = [];
  if (wantStars) for (let i = 0, total = mini ? 90 : nodes.length ? 260 : 620; i < total; i++) {
    const u = Math.random() * 2 - 1, angle = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = .72 + Math.random() * .3;
    stars.push({ x: s * Math.cos(angle) * r, y: u * r, z: s * Math.sin(angle) * r, a: .22 + Math.random() * .5, tw: .3 + Math.random(), phase: Math.random() * 6.28, size: Math.random() < .035 ? 1.6 : .7 });
  }
  const view = { x: 0, y: 0, k: 1, angle:0 }, target = { x: 0, y: 0, k: 1, angle:0 };
  let inputActive=false;
  let userMoved = false, hover = null, selected = focusId ? byId.get(focusId) : null, dragging = null, query = "", hudT = 0, hudFor = selected;
  const filter = { concepts: opts.concepts ?? Boolean(focusId && byId.get(focusId)?.kind === "concept"), structure: true };
  const shown = n => n.kind === "concept" ? filter.concepts : filter.structure || n.kind === "lecture" || n.kind === "note";
  const toWorld = (x, y) => worldPoint({x,y},view,W,H);
  function wake() { needsDraw = true; if (!destroyed && !document.hidden && raf === null) raf = requestAnimationFrame(frame); }
  function fit(instant = false) {
    const points = (focusId ? nodes.filter(n => n.id === focusId || nbrs.get(focusId)?.has(n.id)) : nodes).filter(shown);
    if (!points.length || W < 1 || H < 1) return;
    const bounds=points.map(n=>({x:n.x,y:n.y,r:n.r}));if(!mini&&!focusId)for(const g of galaxies.values())if(points.some(n=>n.galaxy===g.id))bounds.push({x:g.core?.x??g.ax,y:g.core?.y??g.ay,r:g.footprint*.8});
    Object.assign(target,overviewCamera(bounds,W,H,{mini,angle:target.angle}));
    if (instant) Object.assign(view, target);
    wake();
  }
  function home(){userMoved=false;view.angle=Math.atan2(Math.sin(view.angle),Math.cos(view.angle));target.angle=0;fit();}
  function hit(sx, sy) {
    const p = toWorld(sx, sy); let best = null, distance = Infinity;
    for (const n of nodes) {
      if (!shown(n) || n.vis < .3) continue;
      const d = Math.hypot(n.x + n.dx - p.x, n.y + n.dy - p.y);
      if (d < Math.max(n.r * 2.2, (W<650?22:16) / view.k) && d < distance) { best = n; distance = d; }
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
    Object.assign(target,view);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size > 1) {
      releaseDrag(); multiGesture = true; moved = true; downAt = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), k: target.k, fingerAngle:Math.atan2(b.y-a.y,b.x-a.x), angle:target.angle, anchor:toWorld((a.x+b.x)/2,(a.y+b.y)/2) };
      return;
    }
    moved = false; multiGesture = false; downAt = { id: e.pointerId, x: e.offsetX, y: e.offsetY, vx: target.x, vy: target.y,angle:target.angle,rotate:Boolean(e.shiftKey||e.altKey) };
    if (!mini&&!downAt.rotate) { const n = hit(e.offsetX, e.offsetY); if (n) { dragging = n; n.fx = n.x; n.fy = n.y; sim.alphaTarget(.12).restart(); } }
    wake();
  });
  listen(canvas, "pointermove", e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size >= 2 && !mini) {
      const [a, b] = [...pointers.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .04, 6);
      const delta=Math.atan2(b.y-a.y,b.x-a.x)-pinch.fingerAngle,angle=pinch.angle+Math.atan2(Math.sin(delta),Math.cos(delta)),anchor=rotatePoint(pinch.anchor,angle);
      Object.assign(target, { k,angle,x:cx-W/2-anchor.x*k,y:cy-H/2-anchor.y*k }); Object.assign(view, target); userMoved = true; wake(); return;
    }
    if (multiGesture) return;
    if (downAt && Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 5) moved = true;
    if(downAt?.rotate&&moved&&!mini){const delta=(e.offsetX-downAt.x)*.006,p=rotatePoint({x:downAt.vx,y:downAt.vy},delta);Object.assign(target,{angle:downAt.angle+delta,x:p.x,y:p.y});Object.assign(view,target);userMoved=true;wake();return;}
    if (dragging && moved) { const p = toWorld(e.offsetX, e.offsetY); dragging.fx = p.x; dragging.fy = p.y; userMoved = true; wake(); return; }
    if (downAt && moved && !mini) { target.x = downAt.vx + e.offsetX - downAt.x; target.y = downAt.vy + e.offsetY - downAt.y; Object.assign(view, target); userMoved = true; wake(); return; }
    if (e.pointerType === "mouse") { const next = hit(e.offsetX, e.offsetY); if (next !== hover) { hover = next; wake(); } canvas.style.cursor = hover || mini ? "pointer" : "grab"; }
  });
  function finishPointer(e, cancelled = false) {
    if (!pointers.has(e.pointerId)) return;
    const was = dragging, allowTap = !cancelled && !multiGesture && !moved && downAt?.id === e.pointerId;
    pointers.delete(e.pointerId); releaseDrag();
    if (allowTap&&!downAt?.rotate) {
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
    if (["+", "=", "-", "[", "]", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "0", "Escape", "Enter"].includes(e.key)) e.preventDefault();
    if (e.key === "Escape") select(null);
    else if (e.key === "Enter" && selected) onOpen(selected);
    else if (e.key === "0") home();
    else if (e.key === "[" || e.key === "]") { target.angle+=(e.key==='['?-1:1)*Math.PI/12;userMoved=true; }
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
    if (!userMoved&&!inputActive) fit(true); wake();
  });
  ro.observe(host);
  function text(str, x, y, { font = SANS, size = 11, weight = 400, color = rgba(palette.ink, .9), align = "left", base = "middle", spacing = 0 } = {}) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(str, x, y); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  function atmosphere(t) {
    if (!stars.length) return;
    const empty = !nodes.length, radius = Math.max(W,H)*.65;
    const cx=W/2+view.x*.025,cy=H/2+view.y*.025;
    const rotation = reduceMotion ? .3 : t * .000023, cr = Math.cos(rotation), sr = Math.sin(rotation);
    if(empty&&!mini){const size=Math.min(W*.95,H*.7,550);ctx.save();ctx.translate(cx,cy);ctx.rotate(reduceMotion?-.2:t*.000026-.2);ctx.globalAlpha=.88;ctx.drawImage(galaxySprite(sky,0),-size/2,-size/2,size,size);ctx.restore();}
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
    if (!settled && sim.alpha() < .06) { settled = true; if (!userMoved&&!inputActive) fit(); }
    const e = reduceMotion ? 1 : .12;
    view.x += (target.x - view.x) * e; view.y += (target.y - view.y) * e; view.k += (target.k - view.k) * e;
    view.angle += (target.angle-view.angle)*e;
    const active = selected || hover, q = query.toLowerCase(), lit = active ? new Set([active.id, ...nbrs.get(active.id)]) : null;
    for (const n of nodes) {
      const alive = reduceMotion || t > n.born ? 1 : 0, want = !shown(n) ? 0 : lit ? lit.has(n.id) ? 1 : .13 : q ? n.title.toLowerCase().includes(q) ? 1 : .13 : 1;
      n.vis += (want * alive - n.vis) * (reduceMotion ? 1 : .11);
      const amp = reduceMotion ? 0 : n.kind === "concept" ? 1.3 : .65;
      n.dx = Math.sin(t * .00028 + n.phase) * amp; n.dy = Math.cos(t * .00024 + n.phase * 1.3) * amp;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); atmosphere(t);
    ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.rotate(view.angle); ctx.scale(view.k, view.k);
    for (const g of galaxies.values()) { g.sx = 0; g.sy = 0; g.n = 0; g.far = 0; }
    for (const n of nodes) if (n.vis > .05) { const g = galaxies.get(n.galaxy); g.sx += n.x; g.sy += n.y; g.n++; }
    for (const g of galaxies.values()) if (g.n) { g.cx += ((g.core?.x??g.sx/g.n)-g.cx)*.12;g.cy += ((g.core?.y??g.sy/g.n)-g.cy)*.12; }
    for (const n of nodes) if (n.vis > .05) { const g = galaxies.get(n.galaxy); g.far = Math.max(g.far, Math.hypot(n.x - g.cx, n.y - g.cy)); }
    for (const g of galaxies.values()) {
      if (!g.n) continue;g.rad+=(Math.max(g.footprint,g.far+16)-g.rad)*(reduceMotion?1:.08);
      if(mini)continue;
      const dim=active&&active.galaxy!==g.id?.48:1,spin=g.spin+(reduceMotion?0:t*.000026);
      ctx.save();ctx.translate(g.cx,g.cy);ctx.rotate(spin);ctx.globalAlpha=dim*(sky?.93:.88);const size=g.rad*3.2;ctx.drawImage(galaxySprite(sky,g.index),-size/2,-size/2,size,size);ctx.restore();
    }
    ctx.globalCompositeOperation = sky ? "source-over" : "lighter";
    for (const l of links) {
      const s = l.source, d = l.target, highlighted = active && (s === active || d === active), want = Math.min(s.vis, d.vis);
      l.vis += (want - l.vis) * (reduceMotion ? 1 : .15); if (l.vis < .02) continue;
      const sx = s.x + s.dx, sy = s.y + s.dy, tx = d.x + d.dx, ty = d.y + d.dy;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx+tx)/2+(ty-sy)*.13,(sy+ty)/2-(tx-sx)*.13,tx,ty);
      ctx.strokeStyle = rgba(colorOf(s.kind === "concept" ? d : s), (highlighted ? .34 : palette.edge) * l.vis); ctx.lineWidth = (highlighted ? .9 : .5) / view.k; ctx.stroke();
    }
    for (const n of nodes) {
      if (n.vis < .02) continue;
      const c = colorOf(n), x = n.x + n.dx, y = n.y + n.dy, birth = reduceMotion ? 1 : ease((t - n.born) / 900), pulse = reduceMotion ? 1 : 1 + Math.sin(t * .0009 + n.phase) * .05;
      const r = Math.max(n.r, .9 / view.k) * birth * pulse; if (r <= 0) continue;
      const size = r * (n === active ? 17 : n.kind === "section" ? 14 : 8);
      ctx.globalAlpha=n.vis*(sky?.9:.95);ctx.drawImage(glow(c),x-size,y-size,size*2,size*2);
      ctx.globalAlpha=n.vis;ctx.beginPath();ctx.arc(x,y,r*.4,0,Math.PI*2);ctx.fillStyle=palette.core;ctx.fill();
      if(n.kind==='section'||n===active){const flare=r*(n===active?4.8:3.4);ctx.beginPath();ctx.moveTo(x-flare,y);ctx.lineTo(x+flare,y);ctx.moveTo(x,y-flare*.75);ctx.lineTo(x,y+flare*.75);ctx.strokeStyle=rgba(palette.core,.4*n.vis);ctx.lineWidth=.5/view.k;ctx.stroke();}
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;ctx.setTransform(dpr,0,0,dpr,0,0);
    if (hudFor && !mini) {
      hudT += ((selected === hudFor ? 1 : 0) - hudT) * (reduceMotion ? 1 : .12);
      if (hudT > .01) {
        const n=hudFor,p=screenPoint({x:n.x+n.dx,y:n.y+n.dy},view,W,H);
        const title=n.title.length>36?n.title.slice(0,34)+'…':n.title;
        const half=Math.min(W-32,title.length*6.7)/2;
        ctx.globalAlpha=ease(hudT);
        text(title,clamp(p.x,half+16,W-half-16),clamp(p.y+27,100,H-80),{size:12,weight:500,align:'center'});
      }
    }
    // A few collision-free landmarks; individual names appear on hover, tap or search.
    const candidates = [...new Set([...(hover ? [hover] : []), ...nodes.filter(n => q ? n.title.toLowerCase().includes(q) : n.kind === "section"), ...(!q && !mini && userMoved && view.k > 2.4 ? nodes.filter(n => n.kind === "module") : [])])];
    const occupied = [], labelLimit = mini ? 2 : W < 600 ? 3 : 5;
    for (const n of candidates) {
      if (occupied.length >= labelLimit) break;
      if (n.vis < .35 || n === selected) continue;
      const x=n.x+n.dx,y=n.y+n.dy,p=screenPoint({x,y},view,W,H),sx=p.x,sy=p.y;
      if (sx < 12 || sx > W - 12 || sy < (mini ? 12 : 95) || sy > H - (mini ? 24 : 85)) continue;
      const title = n.title.length > 27 ? n.title.slice(0, 25) + "…" : n.title;
      const width = Math.min(W - 24, title.length * 6.4 + 12), left = clamp(sx - width / 2, 12, Math.max(12, W - width - 12)), top = sy + 13;
      const box = {left, right:left + width, top, bottom:top + 23};
      if (occupied.some(r => box.left < r.right + 10 && box.right > r.left - 10 && box.top < r.bottom + 7 && box.bottom > r.top - 7)) continue;
      if (selected && Math.hypot((selected.x + selected.dx - x) * view.k, (selected.y + selected.dy - y) * view.k) < 155) continue;
      occupied.push(box);ctx.globalAlpha = n.vis;
      text(title, left + width / 2, top, {size:n === hover ? 11 : 10,weight:500,color:rgba(n.kind === "section" && !sky ? colorOf(n) : palette.ink,.9),align:"center",base:"top"});
    }
    ctx.globalAlpha = 1;
    const movingView = Math.abs(target.x - view.x) + Math.abs(target.y - view.y) + Math.abs(target.k - view.k) + Math.abs(target.angle-view.angle) > .02;
    if (raf === null && (!reduceMotion || !settled || movingView)) raf = requestAnimationFrame(frame);
  }
  sim.on("tick.lumen", wake);
  sim.on("end.lumen", () => { settled = true; if (!userMoved&&!inputActive) fit(); wake(); });
  updatePreferences();
  if (document.hidden) sim.stop();
  return {
    setFilter(f) { Object.assign(filter, f); if (selected && !shown(selected)) select(null); wake(); },
    setQuery(s) { query = String(s || ""); wake(); },
    focus(id) { const n=byId.get(id);if(!n)return;if(n.kind==='concept')filter.concepts=true;select(n);const k=Math.max(target.k,1.6),p=rotatePoint(n,target.angle),center=overviewCamera([{x:0,y:0}],W,H,{mini});Object.assign(target,{k,x:-p.x*k,y:center.y-p.y*k});userMoved=true;wake(); },
    setInputActive(active) { inputActive=Boolean(active);if(!inputActive&&!userMoved)fit();wake(); },
    zoomBy(factor) { if(!Number.isFinite(factor)||factor<=0)return;const k=clamp(target.k*factor,.04,6),ratio=k/target.k;target.x*=ratio;target.y*=ratio;target.k=k;userMoved=true;wake(); },
    rotateBy(angle) { if(!Number.isFinite(angle))return;const p=rotatePoint(target,angle);target.x=p.x;target.y=p.y;target.angle+=angle;userMoved=true;wake(); },
    clear() { select(null); },
    fit() { home(); },
    destroy() { if (destroyed) return; destroyed = true; if (raf !== null) cancelAnimationFrame(raf); raf = null; sim.on("tick.lumen", null).on("end.lumen", null).stop(); releaseDrag(); ro.disconnect(); cleanups.forEach(fn => fn()); canvas.remove(); },
  };
}
