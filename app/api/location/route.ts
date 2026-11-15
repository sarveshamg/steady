import { NextResponse } from "next/server";
import { logError, readReport, writeReport } from "@/lib/storage";
import { withLocation } from "@/lib/area";

export const runtime = "nodejs";

/** POST { id, location } → saves the ZIP/address for the whole report and clears everything derived from the old one. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id: string; location?: string };
    const report = await readReport(body.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const location = body.location?.trim().slice(0, 200);
    if (!location) return NextResponse.json({ error: "Enter a ZIP code or address." }, { status: 400 });
    if (location !== report.location) await writeReport(withLocation(report, location));
    return NextResponse.json({ location });
  } catch (err) {
    await logError("location", err);
    return NextResponse.json({ error: "Couldn't save that location." }, { status: 500 });
  }
}
