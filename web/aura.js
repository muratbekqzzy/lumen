/* Lumen's atmosphere: a living sky of flowing light and fixed, shimmering stars.
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
  atmosphere.innerHTML = '<canvas class="aura-flow"></canvas>'
    + '<div class="aura-layer aura-space"><i class="aura-cloud"></i></div><div class="aura-layer aura-sky"><i class="aura-cloud"></i></div>'
    + `<div class="aura-sparkles">${sparkles}</div><div class="aura-grain"></div>`;
  document.body.prepend(atmosphere);

  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const isSky = () => root.dataset.theme === "sky" || root.dataset.theme === "light";
  const isCalm = () => root.dataset.motion === "calm" || media.matches;
  const isReading = () => document.body.dataset.scene === "reading";

  // Flowing light uses a bounded, adaptive render target; knowledge stars render separately at retina resolution.
  const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform float uSky; uniform vec2 uPointer;
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
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - .5) * vec2(uRes.x / uRes.y, 1.) * 1.3 + uPointer * .05;
  float t = uTime;
  // Broad, overlapping light volumes drift independently, with no reflective ridges.
  vec2 driftA = vec2(sin(t*.026), cos(t*.022)) * .13;
  vec2 driftB = vec2(cos(t*.019 + 2.3), sin(t*.024 + 1.2)) * .15;
  vec2 q = vec2(fbm(p*.9 + driftA), fbm(p*.9 + vec2(5.2, 1.3) + driftB));
  vec2 r = vec2(fbm(p + .72*(q-.5) + vec2(1.7, 9.2) + driftB), fbm(p + .72*(q-.5) + vec2(8.3, 2.8) + driftA));
  float f = fbm(p*.85 + .65*(r-.5) + vec2(t*.009, -t*.012));
  f = clamp((f-.48)*1.6 + .48, 0., 1.);
  vec2 haze = uv + (q-.5)*.10 + uPointer*.015;
  vec2 a = (haze - vec2(.27 + .09*sin(t*.023), .42 + .10*cos(t*.018))) / vec2(.52, .60);
  vec2 b = (haze - vec2(.73 + .10*cos(t*.017 + 1.7), .60 + .11*sin(t*.021))) / vec2(.58, .54);
  float lightA = exp(-dot(a,a)*1.6), lightB = exp(-dot(b,b)*1.6);
  float veil = clamp(.16 + .46*f + .32*max(lightA,lightB), 0., 1.);
  float radiance = (.36*lightA + .40*lightB) * (.70 + .30*smoothstep(.26,.76,f)) * (.94 + .06*sin(t*.065));
  float warm = clamp(smoothstep(.32,.68,r.y)*.60 + lightA*.40, 0., 1.);
  float cool = clamp(smoothstep(.32,.68,r.x)*.60 + lightB*.40, 0., 1.);

  // Space: deep indigo with periwinkle, orchid and cream light.
  vec3 cs = mix(vec3(.035,.035,.098), vec3(.082,.070,.205), uv.y*.7 + .3*q.y);
  cs = mix(cs, vec3(.215,.200,.520), veil*.62);
  cs = mix(cs, vec3(.455,.560,.860), cool*veil*.54);
  cs = mix(cs, vec3(.860,.520,.760), warm*veil*.50);
  cs += vec3(1.,.940,.860) * radiance * veil * .34;
  cs *= 1. - .34*pow(length(uv - .5)*1.25, 2.);

  // Sky: blush and pale blue with lilac shade and white cloud-light.
  vec3 ck = mix(vec3(.988,.870,.905), vec3(.835,.890,.960), uv.y*.75 + .25*q.x);
  ck = mix(ck, vec3(.655,.790,.905), cool*.55);
  ck = mix(ck, vec3(.845,.600,.810), warm*veil*.60);
  ck = mix(ck, vec3(.600,.560,.800), smoothstep(.50,.80,f)*.34);
  ck = mix(ck, vec3(1.,.992,.985), clamp(radiance*.6 + smoothstep(.62,.9,veil)*.30, 0., 1.));

  vec3 col = mix(cs, ck, uSky);
  col += (hash(gl_FragCoord.xy) - .5) * (2./255.);   // dither: no banding in the dark
  gl_FragColor = vec4(col, 1.);
}`;

  function createFlow(canvas) {
    if (!canvas || typeof canvas.getContext !== "function" || typeof requestAnimationFrame !== "function") return null;
    let gl = null;
    try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch { gl = null; }
    if (!gl) return null;
    let uRes, uTime, uSky, uPointer;
    function setup() {
      const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if(gl.getShaderParameter(s,gl.COMPILE_STATUS))return s;gl.deleteShader(s);return null; };
      const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      if (!vs || !fs){if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);return false;}
      const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)){gl.deleteProgram(program);return false;}
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one full-screen triangle
      const at = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(program, "uRes"); uTime = gl.getUniformLocation(program, "uTime");
      uSky = gl.getUniformLocation(program, "uSky"); uPointer = gl.getUniformLocation(program, "uPointer");
      return true;
    }
    if (!setup()) return null;

    let width = 0, height = 0, clock = 14, mix = isSky() ? 1 : 0, raf = null, lastTick = 0, lastDraw = -1e9, dirty = true, lost = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let quality=1,slowFrames=0,steadyFrames=0;
    function resize() {
      const rect = canvas.getBoundingClientRect(), w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      // Full CSS resolution on phones, with a strict budget on larger screens.
      const scale=Math.min(globalThis.devicePixelRatio||1,1.25,Math.sqrt(700000/(w*h)))*quality;
      const nw = Math.max(2, Math.round(w * scale)), nh = Math.max(2, Math.round(h * scale));
      if (nw !== width || nh !== height) { width = nw; height = nh; canvas.width = nw; canvas.height = nh; gl.viewport(0, 0, nw, nh); }
    }
    function frame(now) {
      raf = null;
      if (lost||document.hidden){lastTick=0;return;}
      const dt = lastTick ? Math.min(80, now - lastTick) : 16; lastTick = now;
      const live = !document.hidden && !isCalm() && !isReading();
      const goal = isSky() ? 1 : 0, fading = !isCalm() && Math.abs(goal - mix) > .002;
      if(live){
        clock+=dt/1000;
        slowFrames=dt>45?slowFrames+1:0;steadyFrames=dt<23?steadyFrames+1:0;
        if(slowFrames>=8&&quality>.55){quality=Math.max(.55,quality*.82);slowFrames=0;dirty=true;}
        else if(steadyFrames>=180&&quality<1){quality=Math.min(1,quality+.08);steadyFrames=0;dirty=true;}
      }
      mix = fading ? mix + (goal - mix) * (1-Math.exp(-dt/320)) : goal;
      pointer.x += ((isCalm()?0:pointer.tx) - pointer.x) * (1-Math.exp(-dt/900)); pointer.y += ((isCalm()?0:pointer.ty) - pointer.y) * (1-Math.exp(-dt/900));
      if (dirty || ((live || fading) && now - lastDraw >= 31)) {   // about 30 frames a second is plenty for slow light
        resize();
        gl.uniform2f(uRes, width, height); gl.uniform1f(uTime, clock); gl.uniform1f(uSky, mix); gl.uniform2f(uPointer, pointer.x, pointer.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        atmosphere.classList.add("aura-gl");
        lastDraw = now; dirty = false;
      }
      if (live || fading) raf = requestAnimationFrame(frame); else lastTick = 0;
    }
    function refresh(){dirty=true;if(document.hidden){if(raf!==null)cancelAnimationFrame(raf);raf=null;lastTick=0;return;}if(raf===null&&!lost)raf=requestAnimationFrame(frame);}
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); lost = true; if (raf !== null) cancelAnimationFrame(raf); raf = null; atmosphere.classList.remove("aura-gl"); });
    canvas.addEventListener("webglcontextrestored", () => { lost = !setup(); width = height = 0; if (!lost){lastTick=0;refresh();} });
    window.addEventListener("resize", refresh);
    if (matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", event => {
      pointer.tx = event.clientX / Math.max(1, innerWidth) - .5; pointer.ty = .5 - event.clientY / Math.max(1, innerHeight);
    }, { passive: true });
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isSky() ? "#f3eef8" : "#121126");
    flow?.refresh();
  }
  document.addEventListener("visibilitychange", updateMotion);
  window.addEventListener("lumen-motion-changed", updateMotion);
  window.addEventListener("lumen-theme-changed", updateTheme);
  window.addEventListener("lumen-scene-changed", updateScene);
  media.addEventListener?.("change", updateMotion);
  updateTheme(); updateScene(); updateMotion();
})();
