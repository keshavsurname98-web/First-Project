// Mount and scroll entrances adapted from the supplied React Bits AnimatedContent.
(() => {
  "use strict";

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Map();

  function reveal(element, options = {}) {
    if (motion.matches || document.hidden || !element.animate) return;

    const stagger = Number(element.dataset.stagger) || 0;
    const targets = stagger > 0 && element.children.length ? Array.from(element.children) : [element];
    const distance = options.distance ?? (element.dataset.animatedContent === "scroll" ? 12 : 6);
    targets.forEach((target, index) => {
      active.get(target)?.cancel();
      const animation = target.animate(
        [
          { opacity: options.opacity ?? 0.35, ...(distance && { transform: `translateY(${distance}px)` }) },
          { opacity: 1, ...(distance && { transform: "translateY(0)" }) }
        ],
        { duration: options.duration ?? 360, delay: index * stagger, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }
      );
      active.set(target, animation);
      const remove = () => {
        if (active.get(target) === animation) active.delete(target);
      };
      animation.onfinish = remove;
      animation.oncancel = remove;
    });
  }

  window.revealAnimatedContent = reveal;
  document.querySelectorAll('[data-animated-content="mount"]').forEach(reveal);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        reveal(entry.target);
      }
    }, { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll('[data-animated-content="scroll"]').forEach(element => observer.observe(element));
  }

  motion.addEventListener("change", () => {
    if (!motion.matches) return;
    active.forEach(animation => animation.cancel());
    active.clear();
  });
})();
