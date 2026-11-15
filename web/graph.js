// Lumen's knowledge universe. Library records are the stars; ambient dust is decorative.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from "./force.js";
import { galaxyLayout, overviewCamera, rotatePoint, screenPoint, worldPoint, canvasPixelRatio, textureResolution, starAppearance } from "./universe.js";

const KIND_R = { section: 2.9, module: 1.8, lecture: 1.65, note: 1.25, concept: .95 };
const SANS = '"Inter Tight", "Inter", -apple-system, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function rgb(value) {
  const hex = typeof value === "string" && /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(value) ? value.slice(1) : "c4b5fd";
  const n = parseInt(hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${clamp(a, 0, 1)})`;
const palettes = {
  space: { ink: "#f4f0fb", muted: "#b3abcf", star: "#dcd3f2", concept: "#b7c4ee", bridge: "#fbd8e0", dust: "#d8d1f0", core: "#fffaf2", halo: "#b9a8e6", edge: .12, lit: .46, gain: 1.4, coreScale: 1.25 },
  aurora: { ink: "#eafaf5", muted: "#9cc7bd", star: "#d4fff0", concept: "#9fe8d2", bridge: "#e9c8ff", dust: "#cdeee6", core: "#ffffff", halo: "#7fe6c4", edge: .12, lit: .5, gain: 1.4, coreScale: 1.25 },
  sky: { ink: "#3f3460", muted: "#7c7099", star: "#9f86c9", concept: "#8397c4", bridge: "#cf90c1", dust: "#a394c8", core: "#6f549f", halo: "#b193d6", edge: .14, lit: .46, gain: 1, coreScale: 1 },
};
const galaxyCache=new Map();let galaxyCacheBytes=0;
function randomFrom(seed){let value=2166136261;for(const char of String(seed))value=Math.imul(value^char.charCodeAt(0),16777619);return()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};}
function galaxySprite(theme,index,pixelDemand=512){const sky=theme==='sky';
 const resolution=textureResolution(pixelDemand),variant=index%2,key=theme+variant+'-'+resolution;
 if(galaxyCache.has(key)){const canvas=galaxyCache.get(key);galaxyCache.delete(key);galaxyCache.set(key,canvas);return canvas;}
 const canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;const g=canvas.getContext('2d'),random=randomFrom('galaxy-'+variant);
 g.setTransform(resolution/512,0,0,resolution/512,0,0);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
 const colors=theme==='aurora'?(variant?['#6fb8ff','#7ef0c0','#c59bff']:['#7ef0c0','#c59bff','#6fb8ff']):sky?(variant?['#8397c4','#cf90c1','#8d80b0']:['#cf90c1','#8d80b0','#8397c4']):variant?['#aacbe0','#cf90c1','#8d80b0']:['#fbd8e0','#8397c4','#cf90c1'];
 // A low-contrast light field, with the same filament positions at every resolution.
 for(let j=0;j<3;j++){
  g.save();g.translate(256+(j-1)*28,256+(j-1)*14);g.scale(1,.6+j*.035);
  const radius=216-j*36,gradient=g.createRadialGradient(0,0,0,0,0,radius);
  gradient.addColorStop(0,rgba(colors[j],sky?.085:.075));gradient.addColorStop(.48,rgba(colors[j],.032));gradient.addColorStop(1,rgba(colors[j],0));
  g.fillStyle=gradient;g.fillRect(-radius,-radius,radius*2,radius*2);g.restore();
 }
 for(let i=0;i<1400;i++){
  const r=Math.min(236,Math.sqrt(-Math.log(Math.max(.0001,1-random())))*105),arm=i%3*Math.PI*2/3,a=r*.025+arm+(random()-.5)*.48;
  const x=256+Math.cos(a)*r+(random()-.5)*15,y=256+Math.sin(a)*r*.6+(random()-.5)*10,size=random()>.996?1.1:.22+random()*.44;
  g.globalAlpha=Math.pow(Math.max(0,1-r/236),1.7)*(.06+random()*.22);g.fillStyle=colors[i%3];g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fill();
 }
 g.globalAlpha=1;const core=g.createRadialGradient(256,256,0,256,256,27);core.addColorStop(0,rgba('#eee7ec',.16));core.addColorStop(.22,rgba(colors[0],.09));core.addColorStop(.65,rgba(colors[1],.025));core.addColorStop(1,rgba(colors[1],0));g.fillStyle=core;g.fillRect(228,228,56,56);
 const used=resolution*resolution*4;
 while(galaxyCache.size&&galaxyCacheBytes+used>42*1024*1024){const oldest=galaxyCache.keys().next().value,cached=galaxyCache.get(oldest);galaxyCacheBytes-=cached.width*cached.height*4;galaxyCache.delete(oldest);}
 galaxyCache.set(key,canvas);galaxyCacheBytes+=used;return canvas;
}
const glowCache=new Map();
function glow(color){
 if(glowCache.has(color))return glowCache.get(color);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d'),gradient=g.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,rgba(color,.38));gradient.addColorStop(.075,rgba(color,.25));gradient.addColorStop(.2,rgba(color,.10));gradient.addColorStop(.45,rgba(color,.024));gradient.addColorStop(1,rgba(color,0));
 g.fillStyle=gradient;g.fillRect(0,0,128,128);if(glowCache.size>=48)glowCache.delete(glowCache.keys().next().value);glowCache.set(color,canvas);return canvas;
}

const sparkleCache=new Map();
function sparkle(color,heart='#ffffff'){
 const key=color+heart;if(sparkleCache.has(key))return sparkleCache.get(key);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d'),c=64;
 const ray=(reach,waist,alpha)=>{g.globalAlpha=alpha;g.beginPath();g.moveTo(c,c-reach);g.quadraticCurveTo(c+waist,c-waist,c+reach,c);g.quadraticCurveTo(c+waist,c+waist,c,c+reach);g.quadraticCurveTo(c-waist,c+waist,c-reach,c);g.quadraticCurveTo(c-waist,c-waist,c,c-reach);g.fill();};
 g.fillStyle=color;ray(62,7,.22);ray(54,3.2,.5);g.fillStyle=heart;ray(40,1.4,.9);
 g.globalAlpha=1;if(sparkleCache.size>=120)sparkleCache.delete(sparkleCache.keys().next().value);sparkleCache.set(key,canvas);return canvas;
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
  let W = 0, H = 0, dpr = canvasPixelRatio(W,H,globalThis.devicePixelRatio||1);
  let destroyed = false, raf = null, palette = palettes.space, sky = false, themeName = 'space', reduceMotion = false;
  let t0 = performance.now(), last = -Infinity, settled = false, needsDraw = true;
  const nodes = (data.nodes || []).map((n, i) => ({ ...n, title: String(n.title || "Untitled"), i, vis: 0, born: 100 + Math.min(i * 12, 720),
    r: (KIND_R[n.kind] || 2) + Math.min(5, Math.sqrt(Math.max(0, n.degree || 0)) * (n.kind === "concept" ? .55 : .35)),
    phase: randomFrom(n.id)() * Math.PI * 2, luminance:.74+randomFrom(n.id+"light")()*.20, dx: 0, dy: 0 }));
  const TINTS = ["#ffffff", "#dfe9ff", "#fff3dc", "#ffe3ee"];
  for (const n of nodes) { const r = randomFrom(n.id + "shimmer"); n.tw1 = .6 + r() * 1.4; n.tw2 = .6 + r() * 1.4; n.tint = TINTS[Math.floor(r() * TINTS.length)]; n.hov = 0; }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = (data.edges || []).filter(e => byId.has(e.source) && byId.has(e.target)).map((e, i) => ({ ...e, vis: 0, hot: 0, seed: (i * .381966) % 1 }));
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
    const original=n.color||galaxies.get(n.galaxy)?.color||palette.star,base=rgb(galaxies.get(n.galaxy)?.index%2?'#c9c1d7':palette.star);
    return '#'+rgb(original).map((value,i)=>Math.round(base[i]*.5+value*.5).toString(16).padStart(2,'0')).join('');
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
    const theme = document.documentElement.dataset.theme; sky = ["sky", "light"].includes(theme); themeName = sky ? "sky" : theme === "aurora" ? "aurora" : "space"; palette = palettes[themeName];
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
    const r = host.getBoundingClientRect(); W = Math.max(0, r.width); H = Math.max(0, r.height); dpr = canvasPixelRatio(W,H,globalThis.devicePixelRatio||1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high"; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (!userMoved&&!inputActive) fit(true); wake();
  });
  ro.observe(host);
  function text(str, x, y, { font = SANS, size = 11, weight = 400, color = rgba(palette.ink, .9), align = "left", base = "middle", spacing = 0 } = {}) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
    ctx.shadowColor = sky ? "rgba(255,252,255,.95)" : "rgba(10,8,30,.95)"; ctx.shadowBlur = 9;   // names stay legible over moving light
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(str, x, y); ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  function atmosphere(t) {
    if (!stars.length) return;
    const empty = !nodes.length, radius = Math.max(W,H)*.65;
    const cx=W/2+view.x*.025,cy=H/2+view.y*.025;
    const rotation = reduceMotion ? .3 : t * .000023, cr = Math.cos(rotation), sr = Math.sin(rotation);
    if(empty&&!mini){const size=Math.min(W*.95,H*.7,550);ctx.save();ctx.translate(cx,cy);ctx.rotate(reduceMotion?-.2:t*.000026-.2);ctx.globalAlpha=.88;ctx.drawImage(galaxySprite(themeName,0,size*dpr),-size/2,-size/2,size,size);ctx.restore();}
    for (const s of stars) {
      const x = s.x * cr - s.z * sr, z = s.x * sr + s.z * cr, depth = clamp((z + 1.2) / 2.2, .05, 1);
      const twinkle = reduceMotion ? 1 : s.tw > .85 ? .5 + .5 * Math.sin(t * .0016 * s.tw + s.phase) : .9 + .1 * Math.sin(t * .0004 * s.tw + s.phase);
      const px = cx + x * radius, py = cy + s.y * radius;
      ctx.globalAlpha = s.a * depth * twinkle * (mini ? .55 : empty ? 1 : sky ? .42 : .8);
      ctx.fillStyle = s.size > 1 ? palette.bridge : palette.dust;
      ctx.fillRect(px, py, s.size, s.size);
      if (empty && s.size > 1 && depth > .65) { ctx.globalAlpha *= .5; const size = 8; ctx.drawImage(glow(palette.halo), px - size, py - size, size * 2, size * 2); }
    }
    ctx.globalAlpha = 1;
  }
  function frame(time) {
    raf = null; if (destroyed || document.hidden) return;
    if (W < 1 || H < 1) return;
    const interacting=pointers.size>0||!settled||Boolean(hover||selected)||Math.abs(target.k-view.k)+Math.abs(target.angle-view.angle)>.01||Math.abs(target.x-view.x)+Math.abs(target.y-view.y)>.5;
    const frameInterval=interacting?1000/60:1000/30;
    if (!needsDraw && !reduceMotion && time - last < frameInterval - 1) { raf = requestAnimationFrame(frame); return; }
    const t = time - t0; last = time; needsDraw = false;
    if (!settled && sim.alpha() < .06) { settled = true; if (!userMoved&&!inputActive) fit(); }
    const e = reduceMotion ? 1 : .12;
    view.x += (target.x - view.x) * e; view.y += (target.y - view.y) * e; view.k += (target.k - view.k) * e;
    view.angle += (target.angle-view.angle)*e;
    const active = selected || hover, q = query.toLowerCase(), lit = active ? new Set([active.id, ...nbrs.get(active.id)]) : null;
    for (const n of nodes) {
      const alive = reduceMotion || t > n.born ? 1 : 0, want = !shown(n) ? 0 : lit ? lit.has(n.id) ? 1 : selected ? .26 : .62 : q ? n.title.toLowerCase().includes(q) ? 1 : .13 : 1;
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
      const size=g.rad*3.2,center=screenPoint({x:g.cx,y:g.cy},view,W,H),reach=size*view.k/2;
      if(center.x+reach<0||center.x-reach>W||center.y+reach<0||center.y-reach>H)continue;
      ctx.save();ctx.translate(g.cx,g.cy);ctx.rotate(spin);ctx.globalAlpha=dim*(sky?.85:.9);ctx.drawImage(galaxySprite(themeName,g.index,size*view.k*dpr),-size/2,-size/2,size,size);ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
    const quick = reduceMotion ? 1 : .14;
    for (const l of links) {
      const s = l.source, d = l.target, highlighted = active && (s === active || d === active), want = Math.min(s.vis, d.vis);
      l.vis += (want - l.vis) * (reduceMotion ? 1 : .15); l.hot += ((highlighted ? 1 : 0) - l.hot) * quick; if (l.vis < .02) continue;
      const sx = s.x + s.dx, sy = s.y + s.dy, tx = d.x + d.dx, ty = d.y + d.dy, cx = (sx+tx)/2+(ty-sy)*.13, cy = (sy+ty)/2-(tx-sx)*.13;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.strokeStyle = rgba(colorOf(s.kind === "concept" ? d : s), (palette.edge + (palette.lit - palette.edge) * l.hot) * l.vis); ctx.lineWidth = (.55 + .45 * l.hot) / view.k; ctx.stroke();
      if (l.hot > .05 && !reduceMotion) {   // a mote of light travels along each thread of the chosen star
        const u = (t * .00045 + l.seed) % 1, v = 1 - u, mx = v*v*sx + 2*v*u*cx + u*u*tx, my = v*v*sy + 2*v*u*cy + u*u*ty, size = 5 / view.k;
        ctx.globalAlpha = l.hot * l.vis * Math.sin(u * Math.PI) * .9; ctx.drawImage(glow(palette.core), mx - size, my - size, size * 2, size * 2); ctx.globalAlpha = 1;
      }
    }
    for (const n of nodes) {
      n.hov += ((n === active ? 1 : 0) - n.hov) * quick;
      if (n.vis < .02) continue;
      const c=colorOf(n),x=n.x+n.dx,y=n.y+n.dy,birth=reduceMotion?1:ease((t-n.born)/900),light=starAppearance(n.kind,n.r,view.k,n===active);
      const radius=light.corePx*birth/view.k,halo=light.haloPx*birth/view.k;if(radius<=0)continue;
      // Scintillation: two slow waves beat against each other, and now and then a star glints.
      const wave=reduceMotion?0:Math.sin(t*.0017*n.tw1+n.phase)*Math.sin(t*.0031*n.tw2+n.phase*1.7),glint=reduceMotion?0:Math.pow(Math.max(0,Math.sin(t*.0007*n.tw1+n.phase*5)),28);
      const shimmer=.78+.22*wave+.55*glint,h=n.hov,landmark=n.kind==='section',heart=sky?palette.core:n.tint;
      if(h>.01){   // the star you point at blooms, breathes out rings of light and gathers orbiting motes
        const bloom=halo*(2.2+1.2*h);ctx.globalAlpha=n.vis*.34*h;ctx.drawImage(glow(c),x-bloom,y-bloom,bloom*2,bloom*2);
        if(!reduceMotion){
          for(let i=0;i<2;i++){const u=(t*.00055+i*.5)%1,ring=halo*(.7+u*2.1);ctx.globalAlpha=n.vis*h*(1-u)*(1-u)*.5;ctx.beginPath();ctx.arc(x,y,ring,0,Math.PI*2);ctx.strokeStyle=c;ctx.lineWidth=1/view.k;ctx.stroke();}
          for(let i=0;i<3;i++){const a=t*.0011+i*2.094+n.phase,orbit=halo*(1.15+.12*Math.sin(t*.002+i)),size=3.2/view.k;ctx.globalAlpha=n.vis*h*.9;ctx.drawImage(glow(heart),x+Math.cos(a)*orbit-size,y+Math.sin(a)*orbit*.82-size,size*2,size*2);}
        }
      }
      const aura=halo*(1+.22*glint+.35*h);
      ctx.globalAlpha=Math.min(1,n.vis*light.haloOpacity*n.luminance*shimmer*palette.gain);ctx.drawImage(glow(c),x-aura,y-aura,aura*2,aura*2);
      const rays=halo*(landmark?.95:.6)*(.82+.3*shimmer+.75*h);
      ctx.globalAlpha=Math.min(1,n.vis*(landmark?.72:.42)*shimmer*(1+.6*h));ctx.drawImage(sparkle(c,heart),x-rays,y-rays,rays*2,rays*2);
      ctx.globalAlpha=Math.min(1,n.vis*n.luminance*palette.gain*(.85+.15*shimmer));ctx.beginPath();ctx.arc(x,y,radius*palette.coreScale*(1+.25*glint+.3*h),0,Math.PI*2);ctx.fillStyle=heart;ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;ctx.setTransform(dpr,0,0,dpr,0,0);
    if (hudFor && !mini) {
      hudT += ((selected === hudFor ? 1 : 0) - hudT) * (reduceMotion ? 1 : .12);
      if (hudT > .01) {
        const n=hudFor,p=screenPoint({x:n.x+n.dx,y:n.y+n.dy},view,W,H);
        const title=n.title.length>36?n.title.slice(0,34)+'…':n.title;
        const half=Math.min(W-32,title.length*6.7)/2;
        ctx.globalAlpha=ease(hudT);
        text(title,clamp(p.x,half+16,W-half-16),clamp(p.y+27,100,H-80),{size:13,weight:400,align:'center'});
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
      const landmark=n.kind==="section";
      const width = Math.min(W - 24, title.length * 6.4 + 12), left = clamp(sx - width / 2, 12, Math.max(12, W - width - 12)), top = sy + 13;
      const box = {left, right:left + width, top, bottom:top + 23};
      if (occupied.some(r => box.left < r.right + 10 && box.right > r.left - 10 && box.top < r.bottom + 7 && box.bottom > r.top - 7)) continue;
      if (selected && Math.hypot((selected.x + selected.dx - x) * view.k, (selected.y + selected.dy - y) * view.k) < 155) continue;
      occupied.push(box);ctx.globalAlpha = n.vis;
      text(landmark?title.toUpperCase():title,left+width/2,top,{font:landmark?MONO:SANS,size:landmark?9.5:11,weight:400,spacing:landmark?.7:0,color:rgba(palette.ink,landmark?.8:.9),align:"center",base:"top"});
    }
    ctx.globalAlpha = 1;
    const movingView = Math.abs(target.x - view.x) + Math.abs(target.y - view.y) + Math.abs(target.k - view.k) + Math.abs(target.angle-view.angle) > .02;
    if (raf === null && (!reduceMotion || !settled || movingView)) raf = requestAnimationFrame(frame);
  }
  sim.on("tick.lumen", wake);
  sim.on("end.lumen", () => { settled = true; if (!userMoved&&!inputActive) fit(); wake(); });
  updatePreferences();
  document.fonts?.ready?.then(()=>{if(!destroyed)wake();}).catch(()=>{});
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
