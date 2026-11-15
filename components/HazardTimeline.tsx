"use client";

import type { Hazard } from "@/lib/schema";
import { PRIORITY_DOT, PRIORITY_LABEL, fmtTime } from "./ui";

/**
 * Our video timeline (the native progress bar is hidden). The track is a seek slider (keyboard: arrow keys);
 * each finding is a coloured marker (urgent red, soon amber, nice gray) that seeks to it and selects it.
 * The selected marker is larger with a white ring.
 */
export function HazardTimeline(props: {
  hazards: Hazard[];
  duration: number;
  current: number;
  selectedId: string | null;
  onSelect: (h: Hazard) => void;
  onSeek?: (seconds: number) => void;
  /** Label for a time: "Photo 5" on photo reports, "0:12" otherwise. */
  labelFor?: (seconds: number) => string;
  /** Labels under the two ends of the track (default: current time and total). */
  endLabels?: [string, string];
  /** Seek slider step in seconds (photo reports: one photo). */
  step?: number;
}) {
  const { hazards, duration, current, selectedId, onSelect, onSeek } = props;
  const label = props.labelFor ?? fmtTime;
  if (!duration) return null;
  const progress = Math.min(1, Math.max(0, current / duration));
  return (
    <div className="mt-3" role="group" aria-label="Video timeline and findings">
      <div className="group relative h-11">
        {/* Track + played portion (scaleX, not width). */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-line group-focus-within:ring-[3px] group-focus-within:ring-primary/35">
          <div
            className="h-full w-full origin-left rounded-full bg-primary/50"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        {/* Seek: a real range input stretched over the track (transparent, still keyboard-operable). */}
        {onSeek && (
          <input
            type="range"
            min={0}
            max={Math.round(duration * 10) / 10}
            step={props.step ?? 0.1}
            value={Math.min(current, duration)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={props.endLabels ? `${label(current)} of ${props.endLabels[1]}` : `${fmtTime(current)} of ${fmtTime(duration)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        )}
        {hazards.map((h) => {
          const left = Math.min(100, Math.max(0, (h.timestamp_s / duration) * 100));
          const selected = h.id === selectedId;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h)}
              title={`${label(h.timestamp_s)}: ${h.title}`}
              aria-label={`${PRIORITY_LABEL[h.priority]}: ${h.title}, ${props.endLabels ? "in" : "at"} ${label(h.timestamp_s)}`}
              aria-current={selected ? "true" : undefined}
              // 44px tap target around a small marker; sits above the seek slider.
              className="absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ left: `${left}%` }}
            >
              <span
                className={`block rounded-full ${PRIORITY_DOT[h.priority]} transition-transform duration-150 ${
                  selected ? "h-6 w-6 border-[3px] border-white shadow-float" : "h-4 w-4 border-2 border-surface"
                } ${h.confidence < 0.75 && !selected ? "opacity-40" : ""}`}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-sm text-muted tabular-nums">
        <span>{props.endLabels ? props.endLabels[0] : fmtTime(current)}</span>
        <span>{props.endLabels ? props.endLabels[1] : fmtTime(duration)}</span>
      </div>
    </div>
  );
}
