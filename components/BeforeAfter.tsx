"use client";

import { useEffect, useRef, useState } from "react";

/** Original clip vs Omni Flash edit, with a draggable divider. Both videos play in sync. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const va = a.current;
    const vb = b.current;
    if (!va || !vb) return;
    const sync = () => {
      if (Math.abs(vb.currentTime - va.currentTime) > 0.15) vb.currentTime = va.currentTime;
    };
    va.addEventListener("timeupdate", sync);
    return () => va.removeEventListener("timeupdate", sync);
  }, []);

  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink">
        <video ref={b} src={after} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />
        <video
          ref={a}
          src={before}
          muted
          loop
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
        <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-3 py-1 text-xs font-semibold text-white">Now</span>
        <span className="absolute right-3 top-3 rounded-full bg-sage px-3 py-1 text-xs font-semibold text-white">
          With the fix · AI visualization
        </span>
      </div>
      <label className="mt-3 block">
        <span className="sr-only">Compare before and after</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="w-full accent-[var(--color-sage)]"
        />
      </label>
    </figure>
  );
}
