"use client";

import type { Hazard } from "@/lib/schema";
import { PRIORITY_STYLE, fmtTime } from "./ui";

export function HazardTimeline(props: {
  hazards: Hazard[];
  duration: number;
  current: number;
  selectedId: string | null;
  onSelect: (h: Hazard) => void;
}) {
  const { hazards, duration, current, selectedId, onSelect } = props;
  if (!duration) return null;
  return (
    <div className="mt-3" aria-label="Hazards along the video">
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sage/40"
          style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
        />
        {hazards.map((h) => {
          const left = Math.min(100, Math.max(0, (h.timestamp_s / duration) * 100));
          const selected = h.id === selectedId;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h)}
              title={`${fmtTime(h.timestamp_s)} · ${h.title}`}
              aria-label={`${h.title} at ${fmtTime(h.timestamp_s)}`}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition ${
                PRIORITY_STYLE[h.priority].dot
              } ${selected ? "h-6 w-6 ring-4 ring-ink/15" : "h-4 w-4 hover:h-5 hover:w-5"} ${
                h.confidence < 0.75 && !selected ? "opacity-35" : ""
              }`}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>0:00</span>
        <span>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}
