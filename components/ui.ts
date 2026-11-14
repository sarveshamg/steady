import type { Hazard } from "@/lib/schema";

export const PRIORITY_LABEL: Record<Hazard["priority"], string> = {
  urgent: "Fix now",
  soon: "Fix soon",
  nice_to_have: "Nice to have",
};

export const PRIORITY_STYLE: Record<Hazard["priority"], { dot: string; chip: string }> = {
  urgent: { dot: "bg-urgent", chip: "bg-urgent-soft text-urgent" },
  soon: { dot: "bg-soon", chip: "bg-soon-soft text-soon" },
  nice_to_have: { dot: "bg-nice", chip: "bg-nice-soft text-nice" },
};

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}
