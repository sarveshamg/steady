"use client";

import { useEffect, useRef, useState } from "react";
import { Button, prefersReducedMotion } from "./ui";

/** Original clip vs Omni Flash edit, with a draggable divider. Both videos play in sync. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const [autoPlay, setAutoPlay] = useState(false);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  // Respect reduced motion: no looping autoplay; the viewer can press play.
  useEffect(() => {
    const ok = !prefersReducedMotion();
    setAutoPlay(ok);
    if (ok) {
      a.current?.play().catch(() => {});
      b.current?.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const va = a.current;
    const vb = b.current;
    if (!va || !vb) return;
    const sync = () => {
      if (Math.abs(vb.currentTime - va.currentTime) > 0.15) vb.currentTime = va.currentTime;
    };
    const play = () => vb.play().catch(() => {});
    const pause = () => vb.pause();
    va.addEventListener("timeupdate", sync);
    va.addEventListener("play", play);
    va.addEventListener("pause", pause);
    return () => {
      va.removeEventListener("timeupdate", sync);
      va.removeEventListener("play", play);
      va.removeEventListener("pause", pause);
    };
  }, []);

  return (
    <figure className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-ink">
        <video ref={b} src={after} muted loop playsInline autoPlay={autoPlay} className="absolute inset-0 h-full w-full object-cover" />
        <video
          ref={a}
          src={before}
          muted
          loop
          playsInline
          autoPlay={autoPlay}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pos}%` }} />
        {/* Text on the frame sits on a bottom gradient so it stays readable. */}
        <div className="frame-overlay pointer-events-none absolute inset-0" aria-hidden />
        <span className="absolute bottom-3 left-3 text-sm font-semibold text-white">Now</span>
        <span className="absolute bottom-3 right-3 text-right text-sm font-semibold text-white">
          With the fix (AI visualization)
        </span>
      </div>
      <div className="flex items-center gap-4">
        <label htmlFor="ba-slider" className="text-sm text-muted">
          Compare
        </label>
        <input
          id="ba-slider"
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="h-11 w-full accent-[#2a5bd7]"
          aria-valuetext={`${pos}% before`}
        />
        {!autoPlay && (
          <Button variant="secondary" className="shrink-0" onClick={() => a.current?.play().catch(() => {})}>
            Play
          </Button>
        )}
      </div>
    </figure>
  );
}
