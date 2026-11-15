import { NextResponse } from "next/server";
import { logError, readReport, writeReport } from "@/lib/storage";
import { lookingFor, searchLocal } from "@/lib/local";
import { ensureGeocoded } from "@/lib/geo";
import { withLocation } from "@/lib/area";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST { id, hazardId, location? } → nearby businesses for that fix. Saving a location applies to the whole report. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id: string; hazardId: string; location?: string };
    let report = await readReport(body.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

    const newLocation = body.location?.trim().slice(0, 200);
    if (newLocation && newLocation !== report.location) {
      report = withLocation(report, newLocation);
      await writeReport(report);
    }
    const location = report.location;
    if (!location) return NextResponse.json({ error: "Add a ZIP code or address first." }, { status: 400 });
    const cached = report.local[body.hazardId];
    // Results cached before distance filtering have no `farther` flag; search again for those.
    if (cached && typeof cached.farther === "boolean") return NextResponse.json(cached);

    const hazard = report.hazards.find((h) => h.id === body.hazardId);
    if (!hazard) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

    // Geocode the home once per location; every later search reuses the cached point.
    report = await ensureGeocoded(report);
    const center = report.location_geo;
    if (!center) throw new Error("LOCATION_NOT_FOUND");

    const looking = lookingFor(hazard);
    const { places, farther } = await searchLocal(looking, location, center);
    const help = { hazard_id: hazard.id, looking_for: looking, places, farther };
    const latest = (await readReport(body.id)) ?? report;
    if (latest.location !== location) return NextResponse.json(help); // location changed meanwhile; don't cache
    await writeReport({ ...latest, local: { ...latest.local, [hazard.id]: help } });
    return NextResponse.json(help);
  } catch (err) {
    await logError("local", err);
    const msg = String(err instanceof Error ? err.message : err);
    if (msg === "LOCATION_NOT_FOUND") {
      return NextResponse.json(
        { error: "Couldn't find that ZIP code or address. Try a different one." },
        { status: 400 },
      );
    }
    if (msg === "MAPS_KEY_MISSING") {
      return NextResponse.json(
        { error: "Local business search isn't set up on this computer yet." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Couldn't load local businesses right now." }, { status: 500 });
  }
}
