import { NextResponse } from "next/server";
import { logError, readReport, writeReport } from "@/lib/storage";
import { priceHazard } from "@/lib/price";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { id, hazardId } = (await req.json()) as { id: string; hazardId: string };
    const report = await readReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (report.prices[hazardId]) return NextResponse.json(report.prices[hazardId]);

    const hazard = report.hazards.find((h) => h.id === hazardId);
    if (!hazard) return NextResponse.json({ error: "Hazard not found." }, { status: 404 });

    const price = await priceHazard(hazard);
    // Re-read in case another price landed meanwhile.
    const latest = (await readReport(id)) ?? report;
    await writeReport({ ...latest, prices: { ...latest.prices, [hazardId]: price } });
    return NextResponse.json(price);
  } catch (err) {
    console.error(err);
    await logError("price", err);
    return NextResponse.json({ error: `Pricing failed: ${String(err)}` }, { status: 500 });
  }
}
