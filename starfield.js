(() => {
  "use strict";

  const canvas = document.querySelector("#starfield");
  const toggle = document.querySelector("#starfield-toggle");
  const field = canvas.parentElement;
  const context = canvas.getContext("2d");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const starColor = "#ffffff";
  const frameInterval = 1000 / 30;

  // A fixed seed keeps the sky consistent across resizes and mode changes.
  let seed = 2069;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  }

  const stars = Array.from({ length: 244 }, (_, index) => {
    const x = random();
    const y = index < 104 ? 0.88 - x * 0.78 + (random() - 0.5) * 0.28 : random();
    const size = 0.35 + random() ** 3 * 1.12;
    const depth = y < 0 ? 0.4 : 0.2 + random() * 0.8;
    return {
      x, y, size, depth,
      brightness: 0.18 + random() * (size > 1.26 ? 0.56 : 0.36),
      phase: random() * Math.PI * 2,
      shimmer: 0.35 + random() * 0.54,
      flare: index % 41 === 0
    };
  });

  let width = 0;
  let height = 0;
  let elapsed = 0;
  let last = null;
  let deadline = null;
  let frame = 0;
  let visible = false;

  function draw() {
    context.clearRect(0, 0, width, height);
    context.strokeStyle = starColor;
    context.fillStyle = starColor;
    for (const star of stars) {
      const x = (star.x * width + elapsed * star.depth * 2) % width;
      const y = ((star.y * height + elapsed * star.depth * 0.55) % height + height) % height;
      const twinkle = 0.86 + Math.sin(elapsed * star.shimmer + star.phase) * 0.14;
      const distance = Math.hypot(x / width - 0.5, y / height - 0.5);
      const brightness = star.brightness * twinkle * Math.min(1, 0.48 + distance * 1.32);

      if (star.flare) {
        context.globalAlpha = brightness * 0.4;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(x - 3, y);
        context.lineTo(x + 3, y);
        context.moveTo(x, y - 4);
        context.lineTo(x, y + 4);
        context.stroke();
      }

      context.globalAlpha = brightness;
      context.beginPath();
      context.arc(x, y, star.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function tick(time) {
    if (deadline === null || time + 0.8 >= deadline) {
      if (last !== null) elapsed += Math.min((time - last) / 1000, 0.1);
      last = time;
      deadline = deadline === null || time - deadline > frameInterval ? time + frameInterval : deadline + frameInterval;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    field.classList.toggle("starfield-off", !toggle.checked);
    cancelAnimationFrame(frame);
    last = deadline = null;
    if (!context || !toggle.checked || !width || !height) return;
    draw();
    if (visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  toggle.addEventListener("change", sync);
  sync();
  if (!context) return;

  new ResizeObserver(() => {
    width = field.clientWidth;
    height = field.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    sync();
  }).observe(field);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(field);
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", sync);
})();
