"use client";

import type { Resident } from "@/lib/schema";
import { SegmentedControl, TextArea, ToggleChip } from "./ui";

export const DEFAULT_RESIDENT: Resident = {
  mobility: "none",
  low_vision: false,
  night_bathroom: false,
  fell_recently: false,
};

const MOBILITY: Array<{ value: Resident["mobility"]; label: string }> = [
  { value: "none", label: "Walks on their own" },
  { value: "cane", label: "Cane" },
  { value: "walker", label: "Walker" },
  { value: "wheelchair", label: "Wheelchair" },
];

export function describeResident(r: Resident | null | undefined): string {
  if (!r) return "Not set";
  const parts: string[] = [];
  if (r.mobility === "cane") parts.push("walks with a cane");
  if (r.mobility === "walker") parts.push("uses a walker");
  if (r.mobility === "wheelchair") parts.push("uses a wheelchair");
  if (r.low_vision) parts.push("low vision");
  if (r.night_bathroom) parts.push("up at night");
  if (r.fell_recently) parts.push("fell in the past year");
  if (r.other_needs?.trim()) parts.push(`“${r.other_needs.trim().slice(0, 60)}${r.other_needs.trim().length > 60 ? "…" : ""}”`);
  if (!parts.length) return "Walks on their own";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ResidentForm({
  value,
  onChange,
  hideLegend = false,
}: {
  value: Resident;
  onChange: (r: Resident) => void;
  /** When a visible heading already says "Who lives here", keep the legend for screen readers only. */
  hideLegend?: boolean;
}) {
  return (
    <fieldset className="space-y-6">
      <legend className={hideLegend ? "sr-only" : "mb-1 text-xl font-semibold"}>Who lives here?</legend>
      <SegmentedControl
        label="Getting around"
        labelId="mobility-label"
        options={MOBILITY}
        value={value.mobility}
        onChange={(mobility) => onChange({ ...value, mobility })}
      />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted">Anything else? Tap any that apply</p>
        <div className="flex flex-wrap gap-2">
          <ToggleChip label="Low vision" checked={value.low_vision} onChange={(v) => onChange({ ...value, low_vision: v })} />
          <ToggleChip label="Up at night" checked={value.night_bathroom} onChange={(v) => onChange({ ...value, night_bathroom: v })} />
          <ToggleChip label="Fell in the past year" checked={value.fell_recently} onChange={(v) => onChange({ ...value, fell_recently: v })} />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="other-needs" className="block text-sm font-semibold text-muted">
          Other needs (optional)
        </label>
        <TextArea
          id="other-needs"
          rows={2}
          maxLength={400}
          value={value.other_needs ?? ""}
          onChange={(e) => onChange({ ...value, other_needs: e.target.value })}
          placeholder="For example: arthritis in her hands, dizzy when standing up"
        />
      </div>
    </fieldset>
  );
}
