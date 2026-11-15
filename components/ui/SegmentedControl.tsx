"use client";

import { useRef } from "react";

/**
 * Single choice from a few options (radio-group semantics). Arrow keys move the choice, as with native radios;
 * only the selected option is in the tab order. Wraps to two columns on narrow screens.
 */
export function SegmentedControl<T extends string>(props: {
  label: string;
  labelId: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = props.options.findIndex((o) => o.value === props.value);

  function move(delta: number) {
    const next = (idx + delta + props.options.length) % props.options.length;
    props.onChange(props.options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="space-y-2">
      <p id={props.labelId} className="text-sm font-semibold text-muted">
        {props.label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={props.labelId}
        className="grid grid-cols-2 gap-1 rounded-md border border-line-strong bg-surface p-1 sm:flex"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), move(1));
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), move(-1));
        }}
      >
        {props.options.map((o, i) => {
          const on = o.value === props.value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => props.onChange(o.value)}
              className={`press min-h-11 rounded-[6px] px-3 py-1 text-base font-medium leading-tight sm:flex-auto sm:whitespace-nowrap ${
                on ? "bg-primary text-on-primary" : "text-ink hover:bg-primary-soft"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
