/** Line illustration for the empty upload state: a staircase with a handrail (ink + primary accent). */
export function StairsIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 112"
      width="160"
      height="112"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`h-auto max-w-full ${className}`}
    >
      {/* floor */}
      <path d="M4 104 H156" stroke="var(--color-line-strong)" />
      {/* steps */}
      <path d="M8 104 H40 V86 H70 V68 H100 V50 H130 V32 H152" stroke="var(--color-ink)" />
      {/* balusters */}
      <path d="M40 86 V62 M70 68 V44 M100 50 V26 M130 32 V8" stroke="var(--color-ink)" opacity="0.55" />
      {/* handrail: the accent */}
      <path d="M30 68 L142 1" stroke="var(--color-primary)" strokeWidth="3.5" />
    </svg>
  );
}
