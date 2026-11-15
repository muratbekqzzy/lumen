/* Lumen's atmosphere: a living sky of flowing light, sparkles and slow star-fall.
   Decorative only: no library content or network requests. */
(() => {
  "use strict";
  const root = document.documentElement;
  const atmosphere = document.createElement("div");
  atmosphere.className = "lumen-atmosphere";
  atmosphere.setAttribute("aria-hidden", "true");

  // Seeded, so the sky is the same on every visit and every device.
  let seed = 20261115;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const sparkles = Array.from({ length: 34 }, () => {
    const size = rand() < .12 ? 15 + rand() * 7 : 6 + rand() * 7;   // smaller than your own stars, so knowledge leads
    return `<i style="left:${(2 + rand() * 96).toFixed(1)}%;top:${(3 + rand() * 92).toFixed(1)}%;--s:${size.toFixed(0)}px;--d:${(3.5 + rand() * 6).toFixed(1)}s;--delay:-${(rand() * 9).toFixed(1)}s"></i>`;
  }).join("");
  const rain = Array.from({ length: 8 }, (_, i) =>
    `<i style="left:${(6 + i * 12.2 + rand() * 6).toFixed(1)}%;--h:${(70 + rand() * 120).toFixed(0)}px;--d:${(17 + rand() * 16).toFixed(1)}s;--delay:-${(rand() * 30).toFixed(1)}s"></i>`).join("");
  atmosphere.innerHTML = '<canvas class="aura-flow"></canvas>'
    + '<div class="aura-layer aura-space"><i class="aura-cloud"></i></div><div class="aura-layer aura-sky"><i class="aura-cloud"></i></div>'
    + `<div class="aura-sparkles">${sparkles}</div><div class="aura-rain">${rain}</div><div class="aura-grain"></div>`;
  document.body.prepend(atmosphere);

  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const isSky = () => root.dataset.theme === "sky" || root.dataset.theme === "light";
  const isAurora = () => root.dataset.theme === "aurora";
  const isCalm = () => root.dataset.motion === "calm" || media.matches;
  const isReading = () => document.body.dataset.scene === "reading";

  // ---- the flowing light: one small fragment shader, drawn at low resolution and scaled up.
  const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform float uSky; uniform float uAurora; uniform vec2 uPointer;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), u.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a*noise(p); p = mat2(1.6, 1.2, -1.2, 1.6)*p + 11.7; a *= .5; }
  return v;
}
// Northern lights: three curtains hang from the dark, each swaying, with fine rays and a bright lower hem.
vec3 northern(vec2 uv, float aspect, float t, vec2 drift){
  vec3 col = mix(vec3(.020,.060,.085), vec3(.022,.028,.085), smoothstep(0., .9, uv.y));
  col += vec3(.020,.075,.070) * (1. - smoothstep(0., .45, uv.y));          // glow along the horizon
  float x = uv.x * aspect + drift.x * .08;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sway = fbm(vec2(x*.8 + fi*4.1, t*.05 + fi*2.3));
    float hang = fbm(vec2(x*(1.5 + fi*.5) + sway*2.2 + fi*7.3, t*.032 + fi));
    float fold = pow(clamp(1. - abs(hang - .5)*2.6, 0., 1.), 1.6);
    float base = .12 + .07*fi + .62*sway + .10*sin(x*2.3 + t*.07 + fi*2.);   // a wavy hem, never a flat line
    float hem = smoothstep(base - .02, base + .07, uv.y);
    float lift = 1. - smoothstep(base + .10, base + .70, uv.y);
    float rays = .5 + .5*noise(vec2(x*24. + sway*10., t*.45 + fi*3.));
    float h = clamp((uv.y - base) / .62, 0., 1.);
    vec3 tint = mix(vec3(.28,1.,.60), vec3(.22,.78,.95), smoothstep(0., .42, h));
    tint = mix(tint, vec3(.74,.42,.98), smoothstep(.38, .95, h));
    col += tint * fold * hem * lift * (.4 + .6*rays) * (.95 - fi*.16);
  }
  return col;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uAurora > .998) { vec3 lights = northern(uv, uRes.x / uRes.y, uTime, uPointer); lights += (hash(gl_FragCoord.xy) - .5) * (2./255.); gl_FragColor = vec4(lights, 1.); return; }
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * 1.3 + uPointer * .05;
  float t = uTime;
  // Silk: the field is bent through itself twice, so light gathers into slow ribbons.
  vec2 q = vec2(fbm(p + vec2(0., t*.045)), fbm(p + vec2(5.2, 1.3) + vec2(-t*.035, t*.012)));
  vec2 r = vec2(fbm(p + 3.4*q + vec2(1.7, 9.2) + t*.028), fbm(p + 3.4*q + vec2(8.3, 2.8) - t*.022));
  float f = fbm(p + 3.0*r);
  float veil = smoothstep(.36, .84, f + .45*(r.x - .45));
  float vein = pow(clamp(1. - abs(2.*fbm(p*1.15 + 2.6*r + vec2(3.1, 7.7)) - .95)*1.7, 0., 1.), 4.);
  float warm = smoothstep(.40, .62, r.y), cool = smoothstep(.40, .62, r.x);

  // Space: deep indigo with periwinkle, orchid and cream light.
  vec3 cs = mix(vec3(.035,.035,.098), vec3(.082,.070,.205), uv.y*.7 + .3*q.y);
  cs = mix(cs, vec3(.215,.200,.520), veil*.62);
  cs = mix(cs, vec3(.455,.560,.860), cool*veil*.54);
  cs = mix(cs, vec3(.860,.520,.760), warm*veil*.50);
  cs += vec3(1.,.940,.860) * vein * veil * .34;
  cs *= 1. - .34*pow(length(uv - .5)*1.25, 2.);

  // Sky: blush and pale blue with lilac shade and white cloud-light.
  vec3 ck = mix(vec3(.988,.870,.905), vec3(.835,.890,.960), uv.y*.75 + .25*q.x);
  ck = mix(ck, vec3(.655,.790,.905), cool*.55);
  ck = mix(ck, vec3(.845,.600,.810), warm*veil*.60);
  ck = mix(ck, vec3(.600,.560,.800), smoothstep(.50,.80,f)*.34);
  ck = mix(ck, vec3(1.,.992,.985), clamp(vein*.6 + smoothstep(.62,.9,veil)*.30, 0., 1.));

  vec3 col = mix(cs, ck, uSky);
  if (uAurora > .002) col = mix(col, northern(uv, uRes.x / uRes.y, t, uPointer), uAurora);
  col += (hash(gl_FragCoord.xy) - .5) * (2./255.);   // dither: no banding in the dark
  gl_FragColor = vec4(col, 1.);
}`;

  function createFlow(canvas) {
    if (!canvas || typeof canvas.getContext !== "function" || typeof requestAnimationFrame !== "function") return null;
    let gl = null;
    try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch { gl = null; }
    if (!gl) return null;
    let uRes, uTime, uSky, uAurora, uPointer;
    function setup() {
      const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      if (!vs || !fs) return false;
      const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one full-screen triangle
      const at = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(program, "uRes"); uTime = gl.getUniformLocation(program, "uTime");
      uSky = gl.getUniformLocation(program, "uSky"); uAurora = gl.getUniformLocation(program, "uAurora"); uPointer = gl.getUniformLocation(program, "uPointer");
      return true;
    }
    if (!setup()) return null;

    let width = 0, height = 0, clock = 14, mix = isSky() ? 1 : 0, lights = isAurora() ? 1 : 0, raf = null, lastTick = 0, lastDraw = -1e9, dirty = true, lost = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    function resize() {
      const rect = canvas.getBoundingClientRect(), w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      // Soft light needs few pixels: about 220k, whatever the screen.
      const scale = Math.max(.25, Math.min(.6, Math.sqrt(220000 / (w * h))));
      const nw = Math.max(2, Math.round(w * scale)), nh = Math.max(2, Math.round(h * scale));
      if (nw !== width || nh !== height) { width = nw; height = nh; canvas.width = nw; canvas.height = nh; gl.viewport(0, 0, nw, nh); }
    }
    function frame(now) {
      raf = null;
      if (lost) return;
      const dt = lastTick ? Math.min(80, now - lastTick) : 16; lastTick = now;
      const live = !document.hidden && !isCalm() && !isReading();
      const goal = isSky() ? 1 : 0, glow = isAurora() ? 1 : 0, fading = Math.abs(goal - mix) > .002 || Math.abs(glow - lights) > .002;
      if (live) clock += dt / 1000;
      mix = fading ? mix + (goal - mix) * Math.min(1, dt / 320) : goal; lights = fading ? lights + (glow - lights) * Math.min(1, dt / 320) : glow;
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt / 900); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt / 900);
      if (dirty || ((live || fading) && now - lastDraw >= 31)) {   // about 30 frames a second is plenty for slow light
        resize();
        gl.uniform2f(uRes, width, height); gl.uniform1f(uTime, clock); gl.uniform1f(uSky, mix); gl.uniform1f(uAurora, lights); gl.uniform2f(uPointer, pointer.x, pointer.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        lastDraw = now; dirty = false;
      }
      if (live || fading) raf = requestAnimationFrame(frame); else lastTick = 0;
    }
    function refresh() { dirty = true; if (raf === null && !lost) raf = requestAnimationFrame(frame); }
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); lost = true; if (raf !== null) cancelAnimationFrame(raf); raf = null; atmosphere.classList.remove("aura-gl"); });
    canvas.addEventListener("webglcontextrestored", () => { lost = !setup(); width = height = 0; if (!lost) { atmosphere.classList.add("aura-gl"); refresh(); } });
    window.addEventListener("resize", refresh);
    if (matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", event => {
      pointer.tx = event.clientX / Math.max(1, innerWidth) - .5; pointer.ty = .5 - event.clientY / Math.max(1, innerHeight);
    }, { passive: true });
    atmosphere.classList.add("aura-gl");
    return { refresh };
  }
  const flow = createFlow(typeof atmosphere.querySelector === "function" ? atmosphere.querySelector(".aura-flow") : null);

  function updateMotion() {
    atmosphere.classList.toggle("aura-still", isCalm() || document.hidden);
    flow?.refresh();
  }
  function updateScene() {
    const view = root.dataset.view;
    const path = location.hash.split("?")[0];
    document.body.dataset.scene = view || (["", "#", "#/", "#/graph"].includes(path) ? "universe" : "reading");
    flow?.refresh();
  }
  function updateTheme() {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isSky() ? "#f3eef8" : isAurora() ? "#07141c" : "#121126");
    flow?.refresh();
  }
  document.addEventListener("visibilitychange", updateMotion);
  window.addEventListener("lumen-motion-changed", updateMotion);
  window.addEventListener("lumen-theme-changed", updateTheme);
  window.addEventListener("lumen-scene-changed", updateScene);
  media.addEventListener?.("change", updateMotion);
  updateTheme(); updateScene(); updateMotion();
})();
