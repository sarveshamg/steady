import type { Report } from "./schema";

/**
 * City/state/ZIP from whatever the user typed, with any street line removed. Used in prompts and on the
 * shared plan page, so a street address never leaves the report. Returns null if nothing safe is left.
 */
export function areaFromLocation(text: string | null | undefined): string | null {
  if (!text) return null;
  const zip = text.match(/\b\d{5}\b/g)?.at(-1) ?? null; // last 5-digit group is the ZIP
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    // Street lines ("123 Main St"), units and PO boxes are dropped.
    .filter((p) => !/^\d+[a-z]?\s+\S/i.test(p) && !/\b(apt|apartment|unit|suite|ste|#|p\.?o\.? box)\b/i.test(p));
  if (text.includes(",") && parts.length > 0) return parts.join(", ").slice(0, 120);
  // No commas: a bare ZIP or city is fine; anything starting with a house number is reduced to its ZIP.
  if (/^\d+[a-z]?\s+\S/i.test(text.trim())) return zip;
  return text.trim().slice(0, 120) || zip;
}

/** The safe area label for a report: geocoded city/ZIP if we have it, else the text heuristic. */
export function reportArea(report: Pick<Report, "location" | "location_area">): string | null {
  return report.location_area ?? areaFromLocation(report.location);
}

/** A new location invalidates everything derived from the old one. */
export function withLocation<R extends Report>(report: R, location: string): R {
  return { ...report, location, location_geo: null, location_area: null, local: {}, funding: null };
}
