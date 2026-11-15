import type { HTMLAttributes, ReactNode } from "react";

/** Surface with a 1px line and 10px radius (24px padding, 16px on mobile). Never nest panels; use row dividers.
 *  tone="info" is the soft blue panel for guidance. */
export function Panel({
  as: Tag = "div",
  tone = "default",
  padding = "md",
  className = "",
  children,
  ...rest
}: {
  as?: "div" | "section" | "aside" | "article";
  tone?: "default" | "info";
  padding?: "none" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const tones = { default: "bg-surface border-line", info: "bg-primary-soft border-primary/25" };
  const pads = { none: "", md: "p-4 sm:p-6", lg: "p-4 sm:p-8" };
  return (
    <Tag {...rest} className={`rounded-lg border ${tones[tone]} ${pads[padding]} ${className}`}>
      {children}
    </Tag>
  );
}

/** Small sentence-case heading used inside panels ("The fix", "Estimated cost"). */
export function Eyebrow({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <p id={id} className={`text-sm font-semibold text-muted ${className}`}>
      {children}
    </p>
  );
}
