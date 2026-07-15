/* ============================================================
   Layer 0 — revealed background (video stand-in).
   Neon-green ink field on a green base, drawn on a 2D canvas so
   no footage is needed. This is what the fluid mask reveals.
   ============================================================ */
export function initBackground(canvas) {
  const ctx = canvas.getContext("2d");
  let w, h;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
  }
  resize();
  addEventListener("resize", resize);

  /* The ink field the letters open onto: neon green running dark to
     light, always in motion so the reveal is unmistakable. */
  const blobs = [
    { c: [120, 255, 60], r: 0.68, sx: 0.13, sy: 0.10, px: 0.0, py: 2.1, amp: 0.30, a: 1.0 },
    { c: [225, 255, 190], r: 0.22, sx: 0.13, sy: 0.10, px: 0.35, py: 2.5, amp: 0.30, a: 1.0 },
    { c: [57, 230, 40], r: 0.36, sx: 0.07, sy: 0.16, px: 3.9, py: 0.6, amp: 0.42, a: 0.9 },
  ];

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function draw(t) {
    ctx.fillStyle = "#1e9634";
    ctx.fillRect(0, 0, w, h);
    for (const b of blobs) {
      const cx = w * (0.5 + b.amp * Math.sin(t * b.sx + b.px));
      const cy = h * (0.5 + b.amp * 0.7 * Math.cos(t * b.sy + b.py));
      const r = Math.min(w, h) * b.r * (1 + 0.18 * Math.sin(t * 0.23 + b.px));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
      g.addColorStop(0.55, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a * 0.45})`);
      g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw(6);
  let raf = 0;
  if (!reduce) {
    const loop = (ts) => { draw(ts / 1000 + 6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
  };
}
