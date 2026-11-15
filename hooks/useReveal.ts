"use client";

import { useEffect, useRef } from "react";

const DEFAULT_STAGGER_MS = 40;
const STAGGER_CAP = 8;

/**
 * Scroll reveal for report panels and finding lists. Attach the returned ref to a container; it and any
 * descendants marked `data-reveal-item` fade up (opacity + 12px translateY, --dur-slow) the first time they
 * enter the viewport. Items stagger 40ms each by default (opts.stagger), capped at 8.
 *
 * Content stays visible without JS: the hidden "pending" state is only set here, after mount. Elements already
 * on screen at mount are left alone (no flash above the fold). Reduced motion: nothing is hidden.
 */
export function useReveal<T extends HTMLElement>(deps: unknown[] = [], opts: { stagger?: number } = {}) {
  const stagger = opts.stagger ?? DEFAULT_STAGGER_MS;
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const items = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-item]"))];
    const vh = window.innerHeight;
    const targets = items.filter((el) => {
      if (el.dataset.reveal === "shown") return false; // already revealed
      // Still pending from an earlier run (its observer was disconnected when deps changed, e.g. a tab
      // switch): observe it again, or it would stay invisible forever.
      if (el.dataset.reveal === "pending") return true;
      const r = el.getBoundingClientRect();
      return r.top > vh * 0.9; // only things starting below the fold
    });
    if (!targets.length) return;

    targets.forEach((el, i) => {
      el.dataset.reveal = "pending";
      const idx = el.hasAttribute("data-reveal-item") ? Number(el.dataset.revealIndex ?? i) : 0;
      el.style.setProperty("--reveal-delay", `${Math.min(idx, STAGGER_CAP) * stagger}ms`);
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.willChange = "opacity, transform";
          el.dataset.reveal = "shown";
          el.addEventListener("transitionend", () => (el.style.willChange = ""), { once: true });
          io.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
