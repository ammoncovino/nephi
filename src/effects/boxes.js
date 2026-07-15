/* ============================================================
   Oarfish info box, photo box, and the swimming fish.
   All position-locked to the smoothed scroll value the fluid loop
   publishes on window.__smoothY, so they rise and sink in lockstep
   with the water. Returns a cleanup function.
   ============================================================ */
export function initBoxes({ box, photos, fish }) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let shown = false, photosShown = false, p2s = 0;
  const sstep = (t) => { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); };

  function update() {
    const y = window.__smoothY ?? scrollY;
    const yv = y / innerHeight; // scroll progress in viewports
    const flood = Math.min(Math.max(yv, 0), 1);
    const full = flood >= 0.98;
    if (full !== shown) {
      shown = full;
      box.classList.toggle("show", full); // triggers the fact stagger
      box.setAttribute("aria-hidden", String(!full));
      fish.setAttribute("aria-hidden", String(!full));
    }
    // Both boxes ride up AND down with the waterline.
    const pIn = sstep((yv - 0.86) / 0.14);
    const p2 = sstep((yv - 1.4) / 0.9);
    p2s = p2;
    const boxOff = (1 - pIn) * 75 - p2s * 130; // vh from center
    box.style.transform = `translate(-50%, calc(-50% + ${boxOff.toFixed(2)}vh))`;
    box.style.opacity = String(Math.max(0, Math.min(1, pIn - p2s * 1.6)));
    // Photo box: surfaces on the deeper stretch of scroll
    const pPh = sstep((yv - 1.9) / 0.5);
    const phOff = (1 - pPh) * 75;
    photos.style.transform = `translate(-50%, calc(-50% + ${phOff.toFixed(2)}vh))`;
    photos.style.opacity = String(pPh);
    const showPhotos = pPh >= 0.5;
    if (showPhotos !== photosShown) {
      photosShown = showPhotos;
      photos.classList.toggle("show", showPhotos);
      photos.setAttribute("aria-hidden", String(!showPhotos));
    }
  }

  // clicking either box dunks it: a quick bob, and the click still
  // reaches the water underneath for the splash rings
  const cleanups = [];
  for (const el of [box, photos]) {
    const inner = el.querySelector(".binner");
    const onDown = () => {
      inner.classList.remove("bump");
      void inner.offsetWidth; // restart the animation
      inner.classList.add("bump");
    };
    const onEnd = (e) => {
      if (e.animationName === "box-bump") e.target.classList.remove("bump");
    };
    el.addEventListener("pointerdown", onDown);
    inner.addEventListener("animationend", onEnd);
    cleanups.push(() => {
      el.removeEventListener("pointerdown", onDown);
      inner.removeEventListener("animationend", onEnd);
    });
  }

  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update, { passive: true });
  window.__oarfishUpdate = update; // also polled by the fluid render loop
  update();

  /* The oarfish rises with the water, lerped each frame so it glides. */
  let cur = 112; // vh offset below resting position
  let raf = 0;
  let disposed = false;
  let ticked = false;
  function fishFrame(ts) {
    ticked = true;
    const y = window.__smoothY ?? scrollY;
    const flood = Math.min(Math.max(y / innerHeight, 0), 1);
    const p = Math.min(Math.max((flood - 0.5) / 0.5, 0), 1);
    const eased = p * p * (3 - 2 * p);
    const target = (1 - eased) * 112;
    cur += (target - cur) * 0.06;
    if (Math.abs(target - cur) < 0.01) cur = target;
    if (reduce) {
      fish.style.transform = `translateY(${target}vh)`;
    } else {
      const bob = Math.sin(ts * 0.0006) * 9;
      const sway = Math.sin(ts * 0.00034 + 1.2) * 1.1;
      fish.style.transform = `translateY(calc(${cur}vh + ${bob}px)) rotate(${sway}deg)`;
    }
    if (!disposed) raf = requestAnimationFrame(fishFrame);
  }
  raf = requestAnimationFrame(fishFrame);
  window.__fishFrame = fishFrame; // debug/verification hook
  let watchdog = 0;
  const watchTimer = setTimeout(() => {
    if (!ticked && !disposed) {
      const tick = () => {
        if (disposed) return;
        fishFrame(performance.now());
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
    delete window.__fishFrame;
    removeEventListener("scroll", update);
    removeEventListener("resize", update);
    cleanups.forEach((fn) => fn());
    delete window.__oarfishUpdate;
  };
}
