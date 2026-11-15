import type { ReactNode } from "react";

export type TagTone = "urgent" | "soon" | "nice" | "success" | "neutral" | "info";

const TONES: Record<TagTone, string> = {
  urgent: "bg-urgent-soft text-urgent",
  soon: "bg-soon-soft text-soon",
  nice: "bg-nice-soft text-nice",
  success: "bg-success-soft text-success",
  neutral: "bg-nice-soft text-ink",
  info: "bg-primary-soft text-primary",
};

/** Small status label. Sentence case, 6px radius; every tone pair is ≥5:1. */
export function Tag({
  tone = "neutral",
  size = "sm",
  children,
  className = "",
}: {
  tone?: TagTone;
  size?: "sm" | "lg";
  children: ReactNode;
  className?: string;
}) {
  const sizes = { sm: "px-2 py-1 text-sm", lg: "px-3 py-1 text-lg" }; // lg: Simple plan (≥18px)
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm font-semibold ${sizes[size]} ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
