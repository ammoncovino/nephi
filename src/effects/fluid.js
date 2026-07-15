/* ============================================================
   Layer 1 — GPU fluid simulation mask.
   Navier-Stokes solve on small FBOs; the dye field cuts a
   transparent hole through a baked NEPHI-on-white texture, and
   a scroll-driven black water layer floods up from the bottom.
   Returns a cleanup function.
   ============================================================ */
export function initFluid({ canvas, chrome }) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float") || reduce) {
    document.body.classList.add("no-fluid");
    return () => {};
  }

  const S = {
    simRes: 256, dyeRes: 512,
    velDissipation: 0.991, dyeDissipation: 0.9965, dyeDissipationBg: 0.993,
    pressureIters: 20, splatForce: 8200, splatRadius: 0.0006,
    splatRadiusBg: 0.0011,
    dyeAmount: 4.5,
    edgeSoftness: 0.5, edgeWidth: 0.01,
  };

  /* ---------- GL plumbing ---------- */
  const VERT = `
    attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  function blit(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function createRT(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  function doubleFBO(w, h) {
    return {
      read: createRT(w, h), write: createRT(w, h),
      swap() { const t = this.read; this.read = this.write; this.write = t; },
    };
  }

  /* ---------- shaders ---------- */
  const P = "precision highp float; varying vec2 vUv;";
  const splatProg = program(`${P}
    uniform sampler2D uTarget; uniform float uAspect;
    uniform vec3 uColor; uniform vec2 uPoint; uniform float uRadius;
    void main(){
      vec2 p = vUv - uPoint; p.x *= uAspect;
      vec3 splat = exp(-dot(p,p)/uRadius) * uColor;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
    }`);
  const dyeSplatProg = program(`${P}
    uniform sampler2D uTarget; uniform float uAspect;
    uniform vec2 uPoint; uniform vec2 uRadii; uniform vec2 uAmounts;
    void main(){
      vec2 p = vUv - uPoint; p.x *= uAspect;
      float d = dot(p,p);
      vec4 base = texture2D(uTarget, vUv);
      base.r += exp(-d/uRadii.x) * uAmounts.x;
      base.g += exp(-d/uRadii.y) * uAmounts.y;
      gl_FragColor = vec4(base.rgb, 1.0);
    }`);
  const advectProg = program(`${P}
    uniform sampler2D uVelocity, uSource; uniform vec2 uTexel;
    uniform float uDt; uniform vec4 uDissipation;
    void main(){
      vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
      gl_FragColor = uDissipation * texture2D(uSource, coord);
    }`);
  const divergeProg = program(`${P}
    uniform sampler2D uVelocity; uniform vec2 uTexel;
    void main(){
      float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.)).x;
      float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.)).x;
      float B = texture2D(uVelocity, vUv - vec2(0., uTexel.y)).y;
      float T = texture2D(uVelocity, vUv + vec2(0., uTexel.y)).y;
      gl_FragColor = vec4(0.5*(R-L+T-B), 0., 0., 1.);
    }`);
  const pressureProg = program(`${P}
    uniform sampler2D uPressure, uDivergence; uniform vec2 uTexel;
    void main(){
      float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.)).x;
      float B = texture2D(uPressure, vUv - vec2(0., uTexel.y)).x;
      float T = texture2D(uPressure, vUv + vec2(0., uTexel.y)).x;
      float div = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L+R+B+T-div)*0.25, 0., 0., 1.);
    }`);
  const gradientProg = program(`${P}
    uniform sampler2D uPressure, uVelocity; uniform vec2 uTexel;
    void main(){
      float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.)).x;
      float B = texture2D(uPressure, vUv - vec2(0., uTexel.y)).x;
      float T = texture2D(uPressure, vUv + vec2(0., uTexel.y)).x;
      vec2 vel = texture2D(uVelocity, vUv).xy - 0.5*vec2(R-L, T-B);
      gl_FragColor = vec4(vel, 0., 1.);
    }`);
  const displayProg = program(`${P}
    uniform sampler2D uBase, uDye, uGlow, uSecret;
    uniform float uEdgeSoftness, uEdgeWidth, uFlood, uTime, uAspect;
    uniform vec4 uClicks[8];
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x),
                 mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
    }
    void main(){
      vec2 dye = texture2D(uDye, vUv).rg;
      float mask = smoothstep(0.18, 0.32, dye.r);
      vec4 base = texture2D(uBase, vUv);
      float glyph = 1.0 - smoothstep(0.35, 0.65, dot(base.rgb, vec3(0.3333)));
      glyph = max(glyph, smoothstep(0.35, 0.65, texture2D(uSecret, vUv).r));
      float maskBg = smoothstep(uEdgeSoftness, uEdgeSoftness + uEdgeWidth, dye.g);
      vec3 inked = mix(vec3(0.043), base.rgb, glyph);
      vec3 color = mix(base.rgb, inked, max(mask * glyph, maskBg));
      float halo = pow(texture2D(uGlow, vUv).r, 1.3) * mask * (1.0 - glyph) * maskBg;
      color = mix(color, vec3(0.55, 1.0, 0.25), min(halo * 2.4, 1.0));
      float alpha = 1.0 - mask * glyph;
      float level = uFlood * 1.0 - 0.02;
      float surface = level;
      for (int q = 0; q < 8; q++) {
        vec4 C = uClicks[q];
        if (C.z >= 0.0 && C.z < 2.0) {
          float ad = abs(vUv.x - C.x);
          float depthFactor = exp(-abs(C.y - level) * 5.0);
          float packet = exp(-pow((ad - C.z * 0.22) / 0.045, 2.0));
          float osc = cos(ad * 70.0 - C.z * 9.0);
          surface += 0.018 * C.w * packet * osc * depthFactor * exp(-C.z * 1.5) * exp(-ad * 2.5);
        }
      }
      float flood = smoothstep(surface + 0.0015, surface - 0.0015, vUv.y);
      vec3 waterCol = mix(vec3(0.055), vec3(0.02), clamp((surface - vUv.y) / 0.18, 0.0, 1.0));
      color = mix(color, waterCol, flood);
      alpha = mix(alpha, 1.0, flood);
      float aboveDark = smoothstep(0.75, 0.97, uFlood) * (1.0 - flood);
      color = mix(color, vec3(0.02), aboveDark);
      alpha = mix(alpha, 1.0, max(aboveDark, 0.0));
      float seam = exp(-pow((vUv.y - surface) / 0.0035, 2.0)) * smoothstep(0.55, 0.9, uFlood);
      color = mix(color, vec3(0.42), seam * 0.85);
      alpha = max(alpha, seam);
      for (int q = 0; q < 8; q++) {
        vec4 C = uClicks[q];
        if (C.z >= 0.0 && C.z < 2.0 && C.w > 0.8) {
          vec2 dvc = (vUv - C.xy) * vec2(uAspect, 1.0);
          float rr = length(dvc);
          float ring = exp(-pow((rr - C.z * 0.34) / 0.016, 2.0))
                     + 0.5 * exp(-pow((rr - C.z * 0.22) / 0.014, 2.0));
          color = mix(color, vec3(0.38), min(ring, 1.0) * 0.09 * exp(-C.z * 1.6) * flood);
        }
      }
      float bubbleOn = smoothstep(0.45, 0.55, uFlood);
      if (bubbleOn > 0.0 && flood > 0.5) {
        float cw = 0.16;
        float bub = 0.0;
        for (int cc = -1; cc <= 1; cc++) {
          float ci = floor(vUv.x / cw) + float(cc);
          float rnd = hash(vec2(ci * 1.7, 7.3));
          if (rnd > 0.45) {
            float spd = 0.05 + rnd * 0.07;
            float yb = fract(uTime * spd + rnd * 9.7) * max(surface, 0.0);
            float rb = (0.005 + rnd * 0.008) * (0.6 + yb);
            float margin = rb / uAspect + 0.012;
            float xb = (ci + 0.5) * cw
                     + (rnd - 0.5) * (cw - 2.0 * margin)
                     + 0.006 * sin(uTime * 2.2 + rnd * 31.0);
            vec2 bpos = vec2(xb, yb);
            for (int q = 0; q < 8; q++) {
              vec4 C = uClicks[q];
              if (C.z >= 0.0 && C.z < 2.0 && C.w > 0.8) {
                vec2 away = (bpos - C.xy) * vec2(uAspect, 1.0);
                float dist = max(length(away), 0.02);
                float push = 0.09 * exp(-dist * dist * 22.0) * exp(-C.z * 2.8);
                bpos += (away / dist) * push;
              }
            }
            vec2 d = (vUv - bpos) * vec2(uAspect, 1.0);
            float dist = length(d);
            bub += smoothstep(rb, rb * 0.88, dist)
                 - smoothstep(rb * 0.72, rb * 0.60, dist);
          }
        }
        color = mix(color, vec3(0.30), min(bub, 1.0) * bubbleOn * flood);
      }
      gl_FragColor = vec4(color, alpha);
    }`);

  /* ---------- state ---------- */
  let velocity, pressure, divergence, dye;
  function initSim() {
    velocity = doubleFBO(S.simRes, S.simRes);
    pressure = doubleFBO(S.simRes, S.simRes);
    divergence = createRT(S.simRes, S.simRes);
    dye = doubleFBO(S.dyeRes, S.dyeRes);
  }
  initSim();

  const baseTex = gl.createTexture();
  const glowTex = gl.createTexture();
  const secretTex = gl.createTexture();
  function uploadTex(tex, src) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function bakeBase() {
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext("2d");
    x.fillStyle = "#fefefe";
    x.fillRect(0, 0, c.width, c.height);
    const size = Math.min(c.width * 0.205, c.height * 0.75);
    x.fillStyle = "#0b0b0b";
    x.textAlign = "center";
    x.textBaseline = "middle";
    const cx = c.width / 2, cy = c.height / 2 + size * 0.04;
    x.canvas.style.letterSpacing = `-${size * 0.035}px`;
    x.font = `${size}px "Archivo Black", sans-serif`;
    x.fillText("NEPHI", cx, cy);
    x.canvas.style.letterSpacing = "normal";
    uploadTex(baseTex, c);

    const g = document.createElement("canvas");
    g.width = c.width; g.height = c.height;
    const gx = g.getContext("2d");
    gx.fillStyle = "#000";
    gx.fillRect(0, 0, g.width, g.height);
    gx.filter = `blur(${Math.round(size * 0.06)}px)`;
    gx.font = `${size}px "Archivo Black", sans-serif`;
    gx.fillStyle = "#fff";
    gx.textAlign = "center";
    gx.textBaseline = "middle";
    gx.fillText("NEPHI", cx, cy);
    gx.filter = "none";
    uploadTex(glowTex, g);

    const s = document.createElement("canvas");
    s.width = c.width; s.height = c.height;
    const sx = s.getContext("2d");
    sx.fillStyle = "#000";
    sx.fillRect(0, 0, s.width, s.height);
    sx.font = `${size * 0.30}px "Pinyon Script", cursive`;
    sx.fillStyle = "#fff";
    sx.textAlign = "right";
    sx.textBaseline = "alphabetic";
    sx.fillText("Fuck you", s.width * 0.94, s.height * 0.92);
    uploadTex(secretTex, s);
  }

  let ready = false;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    bakeBase();
    if (ready) render();
  }
  resize();
  addEventListener("resize", resize);
  if (document.fonts) {
    Promise.all([
      document.fonts.load('100px "Archivo Black"'),
      document.fonts.load('100px "Pinyon Script"'),
      document.fonts.ready,
    ]).then(() => { bakeBase(); if (ready) render(); });
  }

  /* ---------- pointer & splats ---------- */
  const mouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, lastReal: 0 };
  const clicks = [];
  let lastStir = 0;
  function waterLevel() {
    const y = window.__smoothY ?? scrollY;
    const flood = Math.min(Math.max(y / innerHeight, 0), 1);
    return flood * 0.92 - 0.04;
  }
  function onMove(cx, cy) {
    mouse.x = cx / innerWidth;
    mouse.y = 1 - cy / innerHeight;
    mouse.moved = true;
    mouse.lastReal = performance.now();
    if (waterLevel() > 0.03) {
      const now = performance.now();
      if (now - lastStir > 130) {
        lastStir = now;
        clicks.push({ x: mouse.x, y: mouse.y, born: now, s: 0.3 });
        if (clicks.length > 8) clicks.shift();
      }
    }
  }
  const onPointerDown = (e) => {
    if (waterLevel() > 0.03) {
      clicks.push({ x: e.clientX / innerWidth, y: 1 - e.clientY / innerHeight, born: performance.now(), s: 1 });
      if (clicks.length > 8) clicks.shift();
    }
  };
  const onMouseMove = (e) => onMove(e.clientX, e.clientY);
  const onTouchMove = (e) => { if (e.touches.length) onMove(e.touches[0].clientX, e.touches[0].clientY); };
  addEventListener("pointerdown", onPointerDown, { passive: true });
  addEventListener("mousemove", onMouseMove, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: true });

  function splat(x, y, dx, dy, amount) {
    const aspect = canvas.width / canvas.height;
    gl.useProgram(splatProg.p);
    gl.uniform1f(splatProg.u.uAspect, aspect);
    gl.uniform2f(splatProg.u.uPoint, x, y);
    gl.uniform1f(splatProg.u.uRadius, S.splatRadius);
    gl.uniform3f(splatProg.u.uColor, dx * S.splatForce, dy * S.splatForce, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(splatProg.u.uTarget, 0);
    blit(velocity.write); velocity.swap();

    const dyeDrop = (px, py, rMul, aMul, bgMul) => {
      gl.useProgram(dyeSplatProg.p);
      gl.uniform1f(dyeSplatProg.u.uAspect, aspect);
      gl.uniform2f(dyeSplatProg.u.uPoint, px, py);
      gl.uniform2f(dyeSplatProg.u.uRadii,
        S.splatRadius * rMul,
        S.splatRadiusBg * rMul * (0.35 + Math.random() * 1.6));
      gl.uniform2f(dyeSplatProg.u.uAmounts, amount * aMul, amount * aMul * bgMul);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
      gl.uniform1i(dyeSplatProg.u.uTarget, 0);
      blit(dye.write); dye.swap();
    };
    const speed = Math.min(Math.hypot(dx, dy) * 40, 1);
    const jit = 0.006 + speed * 0.02;
    const bgKick = Math.random() < 0.3 ? 0 : 0.3 + Math.random() * 1.5;
    dyeDrop(x + (Math.random() - 0.5) * jit * 2, y + (Math.random() - 0.5) * jit * 2,
      0.5 + Math.random(), 0.7 + Math.random() * 0.6, bgKick);
    const strays = Math.random() < 0.25 + speed * 0.5 ? 1 + (Math.random() * 2 | 0) : 0;
    for (let i = 0; i < strays; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = jit * (1.5 + Math.random() * 3.5);
      dyeDrop(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist,
        0.15 + Math.random() * 0.45, 0.4 + Math.random() * 0.5,
        Math.random() < 0.5 ? 0 : 0.5 + Math.random());
    }
  }

  /* ---------- frame loop ---------- */
  const simTexel = [1 / S.simRes, 1 / S.simRes];

  function step(dt) {
    gl.disable(gl.BLEND);
    gl.useProgram(advectProg.p);
    gl.uniform2f(advectProg.u.uTexel, simTexel[0], simTexel[1]);
    gl.uniform1f(advectProg.u.uDt, dt);
    const v = S.velDissipation;
    gl.uniform4f(advectProg.u.uDissipation, v, v, v, v);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(advectProg.u.uVelocity, 0);
    gl.uniform1i(advectProg.u.uSource, 0);
    blit(velocity.write); velocity.swap();

    gl.uniform4f(advectProg.u.uDissipation, S.dyeDissipation, S.dyeDissipationBg, 1, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(advectProg.u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(advectProg.u.uSource, 1);
    blit(dye.write); dye.swap();

    gl.useProgram(divergeProg.p);
    gl.uniform2f(divergeProg.u.uTexel, simTexel[0], simTexel[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(divergeProg.u.uVelocity, 0);
    blit(divergence);

    gl.useProgram(pressureProg.p);
    gl.uniform2f(pressureProg.u.uTexel, simTexel[0], simTexel[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, divergence.tex);
    gl.uniform1i(pressureProg.u.uDivergence, 1);
    for (let i = 0; i < S.pressureIters; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
      gl.uniform1i(pressureProg.u.uPressure, 0);
      blit(pressure.write); pressure.swap();
    }

    gl.useProgram(gradientProg.p);
    gl.uniform2f(gradientProg.u.uTexel, simTexel[0], simTexel[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
    gl.uniform1i(gradientProg.u.uPressure, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(gradientProg.u.uVelocity, 1);
    blit(velocity.write); velocity.swap();
  }

  let sY = scrollY;
  function render() {
    sY += (scrollY - sY) * 0.11;
    if (Math.abs(scrollY - sY) < 0.5) sY = scrollY;
    window.__smoothY = sY;
    if (window.__oarfishUpdate) window.__oarfishUpdate();
    const flood = Math.min(Math.max(sY / innerHeight, 0), 1);
    if (chrome) chrome.style.opacity = String(1 - flood);
    gl.useProgram(displayProg.p);
    gl.uniform1f(displayProg.u.uFlood, flood);
    gl.uniform1f(displayProg.u.uTime, performance.now() / 1000);
    gl.uniform1f(displayProg.u.uAspect, canvas.width / canvas.height);
    const now = performance.now();
    const cArr = new Float32Array(32).fill(-1);
    let ci = 0;
    for (const k of clicks) {
      const age = (now - k.born) / 1000;
      if (age > 2 || ci >= 8) continue;
      cArr[ci * 4] = k.x; cArr[ci * 4 + 1] = k.y; cArr[ci * 4 + 2] = age; cArr[ci * 4 + 3] = k.s;
      ci++;
    }
    gl.uniform4fv(displayProg.u["uClicks[0]"], cArr);
    gl.uniform1f(displayProg.u.uEdgeSoftness, S.edgeSoftness);
    gl.uniform1f(displayProg.u.uEdgeWidth, S.edgeWidth);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.uniform1i(displayProg.u.uBase, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(displayProg.u.uDye, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, glowTex);
    gl.uniform1i(displayProg.u.uGlow, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, secretTex);
    gl.uniform1i(displayProg.u.uSecret, 3);
    blit(null);
  }

  let last = performance.now();
  let raf = 0;
  let disposed = false;
  let ticked = false;
  function frame(now) {
    ticked = true;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (mouse.moved) {
      const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py;
      const speed = Math.abs(dx) + Math.abs(dy);
      if (speed > 0) {
        const j = 0.012;
        splat(
          mouse.x + (Math.random() - 0.5) * j,
          mouse.y + (Math.random() - 0.5) * j,
          dx * (0.4 + Math.random() * 2.4),
          dy * (0.4 + Math.random() * 2.4),
          S.dyeAmount,
        );
        if (speed > 0.003 && Math.random() < 0.65) {
          const a = Math.random() * Math.PI * 2, d = 0.01 + Math.random() * 0.05;
          const kick = speed * (1.5 + Math.random() * 3.5);
          splat(
            mouse.x + Math.cos(a) * d,
            mouse.y + Math.sin(a) * d,
            Math.cos(a) * kick + dx * (Math.random() * 2.0 - 0.5),
            Math.sin(a) * kick + dy * (Math.random() * 2.0 - 0.5),
            S.dyeAmount * (0.3 + Math.random() * 0.6),
          );
        }
      }
      mouse.moved = false;
    }
    mouse.px = mouse.x; mouse.py = mouse.y;
    step(dt);
    render();
    if (!disposed) raf = requestAnimationFrame(frame);
  }
  ready = true;
  render();
  raf = requestAnimationFrame(frame);
  window.__fluidTick = frame; // debug/verification hook
  // watchdog: some embedded/background viewers never fire rAF while still
  // reporting the page visible — drive the loop manually there.
  let watchdog = 0;
  const watchTimer = setTimeout(() => {
    if (!ticked && !disposed) {
      const tick = () => {
        if (disposed) return;
        frame(performance.now());
        watchdog = setTimeout(tick, 16);
      };
      tick();
    }
  }, 600);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(watchTimer);
    clearTimeout(watchdog);
    delete window.__fluidTick;
    removeEventListener("resize", resize);
    removeEventListener("pointerdown", onPointerDown);
    removeEventListener("mousemove", onMouseMove);
    removeEventListener("touchmove", onTouchMove);
    delete window.__smoothY;
  };
}
