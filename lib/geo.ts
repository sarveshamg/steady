import { geocodeLocation } from "./local";
import { readReport, writeReport } from "./storage";
import type { Report } from "./schema";

/**
 * Geocode the report's location once (Places Text Search) and cache the point and the street-free
 * "City, ST ZIP" label on the report. Later calls reuse the cache. Throws LOCATION_NOT_FOUND / MAPS_KEY_MISSING.
 */
export async function ensureGeocoded(report: Report): Promise<Report> {
  if (!report.location || report.location_geo) return report;
  const { center, area } = await geocodeLocation(report.location);
  const fresh = (await readReport(report.id)) ?? report;
  if (fresh.location !== report.location) return report; // location changed meanwhile; don't cache a stale point
  const updated = { ...fresh, location_geo: center, location_area: area ?? fresh.location_area };
  await writeReport(updated);
  return updated;
}
