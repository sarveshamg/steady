import { NextResponse } from "next/server";
import { logError, readReport, videoPath, writeReport } from "@/lib/storage";
import { analyzeVideo, analyzeYouTube } from "@/lib/analyze";
import { Resident, type Report } from "@/lib/schema";
import { applyResidentRules } from "@/lib/filters";

const clean = (r: Report): Report => ({ ...r, hazards: applyResidentRules(r.hazards, r.resident) });

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const report = await readReport(id);
    return report
      ? NextResponse.json(clean(report))
      : NextResponse.json({ error: "Report not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "That report link isn't valid." }, { status: 400 });
  }
}

function friendly(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err);
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return "The Gemini API key is out of quota (YouTube links use the API key, not the Google Cloud credit). Try an uploaded video instead.";
  }
  if (msg.includes("OVERLOADED: ")) {
    return msg.slice(msg.indexOf("OVERLOADED: ") + "OVERLOADED: ".length).replace(/\s*\[cause:[\s\S]*$/, "");
  }
  if (msg.startsWith("YOUTUBE_NEEDS_KEY: ")) return msg.slice("YOUTUBE_NEEDS_KEY: ".length);
  if (/default credentials/i.test(msg)) {
    return "Google Cloud login missing on this computer. In Terminal run: gcloud auth application-default login (then restart npm run dev).";
  }
  if (/not found|404/i.test(msg) && /model/i.test(msg)) {
    return "The Gemini model ID wasn't found. Check ANALYSIS_MODEL in .env.local against Vertex AI Model Garden.";
  }
  if (/ANALYSIS_TIMEOUT/.test(msg)) {
    return "Gemini took too long to answer. Wait a minute and try again.";
  }
  if (/\b503\b|UNAVAILABLE|high demand/i.test(msg)) {
    return "Gemini is busy right now. Wait a minute and try again.";
  }
  if (/permission|403/i.test(msg)) {
    return "Google Cloud refused the request. Check that GOOGLE_CLOUD_PROJECT=steady-devfest and that your login has access to it.";
  }
  return "Couldn't check this video. Try again in a minute.";
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
    if (report.hazards.length > 0 && !force) return NextResponse.json(clean(report));

    const { rooms, hazards } =
      report.source.type === "youtube"
        ? await analyzeYouTube(report.source.url, report.resident)
        : await analyzeVideo(videoPath(id), report.resident);
    const updated = { ...report, rooms_covered: rooms, hazards, prices: {}, clips: {}, local: {}, funding: null };
    await writeReport(updated);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    await logError("analyze", err);
    return NextResponse.json({ error: friendly(err) }, { status: 500 });
  }
}
