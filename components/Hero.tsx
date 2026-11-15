"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import hero from "@/public/hero.jpg";
import { ButtonLink } from "./ui";

const PARALLAX = 0.08;
const IMAGE_SCALE = 1.08; // headroom so parallax never reveals the card edges

/**
 * Landing hero: headline + actions on the left, the house photo in a card on the right (stacked on mobile).
 * Entrance motion is CSS (.hero-in / .hero-photo / .hero-chip in globals.css), so it runs without JS and is
 * removed entirely under prefers-reduced-motion. Parallax is JS: rAF + passive scroll, only while the hero is on
 * screen, clamped so the scaled image never shows an edge.
 */
export function Hero() {
  const section = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = media.current;
    const root = section.current;
    if (!el || !root) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let onScreen = true;
    const apply = () => {
      frame = 0;
      const headroom = ((IMAGE_SCALE - 1) / 2) * el.offsetHeight;
      const y = Math.min(headroom, window.scrollY * PARALLAX);
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${IMAGE_SCALE})`;
    };
    const onScroll = () => {
      if (!onScreen || frame) return;
      frame = requestAnimationFrame(apply);
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      el.style.willChange = onScreen ? "transform" : "";
    });
    io.observe(root);
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      ref={section}
      aria-labelledby="hero-title"
      className="mx-auto grid max-w-[1120px] items-center gap-8 min-[900px]:min-h-[70vh] min-[900px]:grid-cols-2 min-[900px]:gap-12"
    >
      <div className="space-y-6">
        <h1
          id="hero-title"
          className="hero-in text-[2.5rem] font-bold leading-[1.1] text-ink min-[900px]:text-[3rem]"
          style={{ animationDelay: "0ms" }}
        >
          See what could cause a fall at home
        </h1>
        <p className="hero-in max-w-[34rem] text-lg text-muted" style={{ animationDelay: "80ms" }}>
          Film a walkthrough. Steady finds the hazards, the fixes, local help and ways to pay.
        </p>
        <div className="hero-in flex flex-wrap items-center gap-4" style={{ animationDelay: "160ms" }}>
          <ButtonLink href="#start" size="lg">
            Check a home
          </ButtonLink>
          <ButtonLink href="#how" variant="ghost" size="lg">
            See how it works
          </ButtonLink>
        </div>
      </div>

      <div className="hero-photo relative aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-line shadow-float">
        <div ref={media} className="absolute inset-0" style={{ transform: `scale(${IMAGE_SCALE})` }}>
          <Image
            src={hero}
            alt="A two-story blue house with front steps and a porch railing"
            fill
            priority
            placeholder="blur"
            sizes="(min-width: 900px) 560px, 100vw"
            className="object-cover object-[center_45%]"
          />
        </div>
      </div>
    </section>
  );
}
