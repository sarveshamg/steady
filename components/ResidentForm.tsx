"use client";

import type { Resident } from "@/lib/schema";

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
  return parts.length ? parts.join(" · ") : "Walks on their own";
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        props.checked ? "border-sage bg-sage text-white" : "border-line bg-card hover:border-ink/30"
      }`}
    >
      {props.checked ? "✓ " : ""}
      {props.label}
    </button>
  );
}

export function ResidentForm({ value, onChange }: { value: Resident; onChange: (r: Resident) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold">Who lives here?</legend>
      <div>
        <p className="mb-2 text-xs text-muted">Getting around</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Getting around">
          {MOBILITY.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={value.mobility === m.value}
              onClick={() => onChange({ ...value, mobility: m.value })}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                value.mobility === m.value ? "border-sage bg-sage text-white" : "border-line bg-card hover:border-ink/30"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted">Anything else? Tap all that apply</p>
        <div className="flex flex-wrap gap-2">
          <Toggle label="Low vision" checked={value.low_vision} onChange={(v) => onChange({ ...value, low_vision: v })} />
          <Toggle
            label="Gets up at night"
            checked={value.night_bathroom}
            onChange={(v) => onChange({ ...value, night_bathroom: v })}
          />
          <Toggle
            label="Fell in the past year"
            checked={value.fell_recently}
            onChange={(v) => onChange({ ...value, fell_recently: v })}
          />
        </div>
      </div>
      <div>
        <label htmlFor="other-needs" className="mb-2 block text-xs text-muted">
          Any other needs? (optional)
        </label>
        <textarea
          id="other-needs"
          rows={2}
          maxLength={400}
          value={value.other_needs ?? ""}
          onChange={(e) => onChange({ ...value, other_needs: e.target.value })}
          placeholder="e.g. hard of hearing, arthritis in her hands, gets dizzy when standing up, uses oxygen tubing"
          className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
        />
        <p className="mt-1 text-right text-xs text-muted">{(value.other_needs ?? "").length}/400</p>
      </div>
    </fieldset>
  );
}
