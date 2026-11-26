// Adapted from the supplied React Bits Magnet component.
(() => {
  "use strict";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const stiffness = 210;
  const damping = 27;
  const padding = 28;
  const strength = 7;
  const magnets = Array.from(document.querySelectorAll("[data-magnet]"), button => ({
    button,
    surface: button.querySelector(".magnet-surface"),
    maxOffset: Number(button.dataset.magnet),
    x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0
  }));
  if (!magnets.length) return;

  let pointer = null;
  let owner = null;
  let frame = 0;
  let previous = null;

  function reach(rect, point) {
    const dx = point.x - (rect.left + rect.width / 2);
    const dy = point.y - (rect.top + rect.height / 2);
    const outside = Math.hypot(
      Math.max(0, Math.abs(dx) - rect.width / 2),
      Math.max(0, Math.abs(dy) - rect.height / 2)
    );
    return { dx, dy, outside };
  }

  function refresh() {
    if (reducedMotion.matches || document.hidden) return;
    let nearest = Infinity;
    let closestCenter = Infinity;
    let winner = null;
    for (const magnet of magnets) {
      magnet.targetX = magnet.targetY = 0;
      if (!pointer || magnet.button.disabled || magnet.button.matches(":focus-visible")) continue;
      const { dx, dy, outside } = reach(magnet.button.getBoundingClientRect(), pointer);
      const center = Math.hypot(dx, dy);
      if (outside > padding || outside > nearest || (outside === nearest && center >= closestCenter)) continue;
      winner = { magnet, dx, dy, outside, center };
      nearest = outside;
      closestCenter = center;
    }

    if (winner) {
      const { magnet, dx, dy, outside, center } = winner;
      const t = Math.max(0, (outside - padding / 2) / (padding / 2));
      const falloff = 1 - t * t * (3 - 2 * t);
      const ratio = Math.min(falloff / strength, magnet.maxOffset / Math.max(center, 1));
      magnet.targetX = dx * ratio;
      magnet.targetY = dy * ratio;
    }

    const nextOwner = winner?.magnet ?? null;
    if (owner !== nextOwner) {
      owner?.button.removeAttribute("data-magnet-active");
      nextOwner?.button.setAttribute("data-magnet-active", "");
      owner = nextOwner;
    }
    if (!frame && magnets.some(magnet => magnet.x !== magnet.targetX || magnet.y !== magnet.targetY)) {
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    frame = 0;
    const dt = previous === null ? 1 / 60 : Math.max(0.001, Math.min((now - previous) / 1000, 1 / 30));
    previous = now;
    const steps = Math.ceil(dt * 120);
    const step = dt / steps;
    let moving = false;

    for (const magnet of magnets) {
      for (let index = 0; index < steps; index += 1) {
        magnet.vx += (stiffness * (magnet.targetX - magnet.x) - damping * magnet.vx) * step;
        magnet.vy += (stiffness * (magnet.targetY - magnet.y) - damping * magnet.vy) * step;
        magnet.x += magnet.vx * step;
        magnet.y += magnet.vy * step;
      }
      const close = Math.hypot(magnet.x - magnet.targetX, magnet.y - magnet.targetY) < 0.05;
      if (close && Math.hypot(magnet.vx, magnet.vy) < 0.05) {
        magnet.x = magnet.targetX;
        magnet.y = magnet.targetY;
        magnet.vx = magnet.vy = 0;
      } else {
        moving = true;
      }
      magnet.surface.style.transform = magnet.x || magnet.y
        ? `translate3d(${magnet.x.toFixed(2)}px, ${magnet.y.toFixed(2)}px, 0)`
        : "";
    }

    if (moving) frame = requestAnimationFrame(tick);
    else previous = null;
  }

  function release() {
    pointer = null;
    refresh();
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = pointer = owner = null;
    for (const magnet of magnets) {
      magnet.x = magnet.y = magnet.vx = magnet.vy = magnet.targetX = magnet.targetY = 0;
      magnet.surface.style.transform = "";
      magnet.button.removeAttribute("data-magnet-active");
    }
  }

  window.addEventListener("pointermove", event => {
    const overStaticButton = event.target.closest?.("button:not([data-magnet])");
    if (event.pointerType !== "mouse" || event.buttons || overStaticButton) {
      if (pointer) release();
      return;
    }
    if (reducedMotion.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    refresh();
  }, { passive: true });
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  window.addEventListener("resize", refresh);
  window.addEventListener("blur", release);
  document.documentElement.addEventListener("pointerleave", release);
  document.addEventListener("focusin", event => {
    if (event.target.matches(":focus-visible")) release();
  });
  document.addEventListener("visibilitychange", reset);
  reducedMotion.addEventListener("change", reset);
})();
