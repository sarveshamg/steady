import { NextResponse } from "next/server";
import { logError, readReport, writeReport } from "@/lib/storage";
import { findFunding } from "@/lib/funding";
import { ensureGeocoded } from "@/lib/geo";
import { reportArea } from "@/lib/area";
import { applyResidentRules } from "@/lib/filters";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST { id, force? } → programs that help pay for (or do) the fixes, for the report's area.
 * Cached on the report (cleared when the location changes or findings are re-run).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id: string; force?: boolean };
    let report = await readReport(body.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (!report.location) return NextResponse.json({ error: "Add a ZIP code or address first." }, { status: 400 });
    if (report.funding && !body.force) return NextResponse.json(report.funding);

    // City/ZIP only: geocode (if Maps is set up) for a clean label; otherwise strip the street line from the text.
    try {
      report = await ensureGeocoded(report);
    } catch {
      /* no Maps key or not found: fall back to the text heuristic */
    }
    const area = reportArea(report);
    if (!area) {
      return NextResponse.json({ error: "Add a ZIP code (or city and state) so we can find programs near you." }, { status: 400 });
    }

    const hazards = applyResidentRules(report.hazards, report.resident);
    const funding = await findFunding(area, hazards, report.resident);

    const latest = (await readReport(body.id)) ?? report;
    if (latest.location === report.location) await writeReport({ ...latest, funding });
    return NextResponse.json(funding);
  } catch (err) {
    await logError("funding", err);
    const msg = String(err instanceof Error ? err.message : err);
    if (/\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg)) {
      return NextResponse.json({ error: "Gemini is busy right now. Wait a minute and try again." }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't look up help programs right now. Try again in a minute." }, { status: 500 });
  }
}
