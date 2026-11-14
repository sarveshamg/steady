import { NextResponse } from "next/server";
import { readReport, videoPath, writeReport } from "@/lib/storage";
import { analyzeVideo, analyzeYouTube } from "@/lib/analyze";
import { Resident } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const report = await readReport(id);
    return report
      ? NextResponse.json(report)
      : NextResponse.json({ error: "Report not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }
}

function friendly(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err);
  if (/default credentials/i.test(msg)) {
    return "Google Cloud login missing on this computer. In Terminal run: gcloud auth application-default login (then restart npm run dev).";
  }
  if (/not found|404/i.test(msg) && /model/i.test(msg)) {
    return "The Gemini model ID wasn't found. Check ANALYSIS_MODEL in .env.local against Vertex AI Model Garden.";
  }
  if (/permission|403/i.test(msg)) {
    return "Google Cloud refused the request. Check that GOOGLE_CLOUD_PROJECT=steady-devfest and that your login has access to it.";
  }
  return `Analysis failed: ${msg}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id: string; force?: boolean; resident?: unknown };
    const { id } = body;
    let force = !!body.force;
    const stored = await readReport(id);
    if (!stored) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    // Changing who lives here means re-running the analysis with the new profile.
    let report = stored;
    if (body.resident !== undefined) {
      const parsed = body.resident === null ? null : Resident.safeParse(body.resident).data ?? null;
      report = { ...stored, resident: parsed };
      await writeReport(report);
      force = true;
    }
    // Cached unless explicitly re-run: analysis results are reused for the demo.
    if (report.hazards.length > 0 && !force) return NextResponse.json(report);

    const { rooms, hazards } =
      report.source.type === "youtube"
        ? await analyzeYouTube(report.source.url, report.resident)
        : await analyzeVideo(videoPath(id), report.resident);
    const updated = { ...report, rooms_covered: rooms, hazards, prices: {}, clips: {} };
    await writeReport(updated);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: friendly(err) }, { status: 500 });
  }
}
