import type { Hazard } from "@/lib/schema";

export const PRIORITY_LABEL: Record<Hazard["priority"], string> = {
  urgent: "Fix now",
  soon: "Fix soon",
  nice_to_have: "Nice to have",
};

/** Tag tone for each priority (components/ui/Tag.tsx). */
export const PRIORITY_TONE: Record<Hazard["priority"], "urgent" | "soon" | "nice"> = {
  urgent: "urgent",
  soon: "soon",
  nice_to_have: "nice",
};

/** Timeline marker colour for each priority. */
export const PRIORITY_DOT: Record<Hazard["priority"], string> = {
  urgent: "bg-urgent",
  soon: "bg-soon",
  nice_to_have: "bg-nice",
};

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

/** "0.4 mi", "3.2 mi", "12 mi": one decimal close by, whole miles beyond 10. */
export function fmtMiles(mi: number): string {
  if (mi < 0.1) return "< 0.1 mi";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** POST JSON; errors come back as plain sentences, never raw JSON or stack traces. */
export async function postJson<T>(url: string, body: unknown, fallback = "Something went wrong. Try again in a minute."): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach Steady. Check your connection and try again.");
  }
  let json: { error?: unknown } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = typeof json?.error === "string" && json.error.length < 300 && !/[{}]/.test(json.error) ? json.error : fallback;
    throw new Error(msg);
  }
  return json as T;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Price range. A $0 low end reads "Free – $X"; both $0 reads "Free". */
export function fmtRange(low: number, high: number): string {
  if (low <= 0 && high <= 0) return "Free";
  if (low <= 0) return `Free – ${fmtMoney(high)}`;
  return `${fmtMoney(low)}–${fmtMoney(high)}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One wording for "how much is there to do", used by the summary headline and the findings list heading.
 * 0 → "Looks good — nothing to fix"; only nice-to-have → "Looks good · N thing(s) to consider";
 * otherwise "N thing(s) to fix", plus " · M urgent" when any are urgent.
 */
export function findingsHeadline(hazards: Array<Pick<Hazard, "priority">>): string {
  const n = hazards.length;
  if (n === 0) return "Looks good — nothing to fix";
  if (hazards.every((h) => h.priority === "nice_to_have")) return `Looks good · ${plural(n, "thing")} to consider`;
  const urgent = hazards.filter((h) => h.priority === "urgent").length;
  return `${plural(n, "thing")} to fix${urgent > 0 ? ` · ${urgent} urgent` : ""}`;
}

type SourceLike = { type: string; count?: number; secondsPerPhoto?: number };

/** Photo number (1-based) for a timestamp in a photo slideshow: floor(t / s) + 1, capped at the photo count. */
export function photoNumber(t: number, secondsPerPhoto: number, count: number): number {
  return Math.min(count, Math.max(1, Math.floor(t / secondsPerPhoto) + 1));
}

/** "Photo 5" for photo reports, "0:12" for video reports. */
export function whenLabel(source: SourceLike | null | undefined, t: number): string {
  if (source?.type === "photos" && source.count && source.secondsPerPhoto) {
    return `Photo ${photoNumber(t, source.secondsPerPhoto, source.count)}`;
  }
  return fmtTime(t);
}
