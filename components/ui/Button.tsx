import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

/**
 * Class string for a button look, so links and labels can share it.
 * primary: solid blue. secondary: white with line-strong border. ghost: text only.
 * Disabled: surface background, line border, muted text (pair it with a one-line hint).
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", full = false): string {
  const base =
    "press inline-flex items-center justify-center gap-2 rounded-md font-semibold disabled:cursor-not-allowed " +
    "disabled:border disabled:border-line disabled:bg-surface disabled:text-muted";
  const sizes = { md: "min-h-11 text-base", lg: "min-h-12 text-lg" };
  // Ghost buttons get tight padding so they line up with text (wrap rows in -ml-2).
  const pad = variant === "ghost" ? "px-2" : size === "lg" ? "px-6" : "px-4";
  const variants = {
    primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed",
    secondary: "border border-line-strong bg-surface text-ink hover:border-ink/45 hover:bg-page active:border-ink/60",
    ghost: "text-primary underline-offset-4 hover:text-primary-hover hover:underline active:text-primary-pressed",
  };
  return `${base} ${sizes[size]} ${pad} ${variants[variant]} ${full ? "w-full" : ""}`;
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; children: ReactNode; className?: string };

export function Button({ variant, size, full, className = "", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} className={`${buttonClass(variant, size, full)} ${className}`} />;
}

/** A link that looks like a button. External links open in a new tab and say so to screen readers. */
export function ButtonLink({
  variant,
  size,
  full,
  className = "",
  external,
  children,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement> & { external?: boolean }) {
  return (
    <a
      {...rest}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`${buttonClass(variant, size, full)} ${className}`}
    >
      {children}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}
