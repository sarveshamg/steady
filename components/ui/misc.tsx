import type { ReactNode } from "react";
import { CheckIcon } from "../icons";

/** On/off chip. Unselected: white with line-strong border. Selected: soft blue, primary border, check icon. */
export function ToggleChip(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className={`press inline-flex min-h-11 items-center gap-2 rounded-md border px-4 font-medium ${
        props.checked
          ? "border-primary bg-primary-soft text-ink"
          : "border-line-strong bg-surface text-ink hover:border-ink/45 active:bg-page"
      }`}
    >
      {props.checked && <CheckIcon className="h-[18px] w-[18px] text-primary" />}
      {props.label}
    </button>
  );
}

export function ProgressBar(props: { value: number; max: number; label: string; valueText?: string }) {
  const pct = props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-line"
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      aria-valuetext={props.valueText}
    >
      {/* Animates with transform (scaleX), not width. */}
      <div
        className="h-full w-full origin-left rounded-full bg-success transition-transform duration-[var(--dur)] ease-[var(--ease-out)]"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

/** One sentence and (optionally) one action. */
export function EmptyState(props: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface p-4 sm:p-6">
      <div className="flex items-start gap-3">
        {props.icon && <span className="mt-1 text-muted">{props.icon}</span>}
        <p>{props.children}</p>
      </div>
      {props.action}
    </div>
  );
}
