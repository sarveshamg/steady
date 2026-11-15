import { NextResponse } from "next/server";
import { logError, readReport, videoPath, writeReport } from "@/lib/storage";
import { omniBudget, visualizeFix } from "@/lib/omni";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(await omniBudget());
}

export async function POST(req: Request) {
  try {
    const { id, hazardId } = (await req.json()) as { id: string; hazardId: string };
    const report = await readReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (report.source.type === "youtube") {
      return NextResponse.json(
        { error: "Before/after views need a video you upload yourself. YouTube videos can't be edited." },
        { status: 400 },
      );
    }
    if (report.clips[hazardId]) return NextResponse.json({ clip: report.clips[hazardId], cached: true });

    const hazard = report.hazards.find((h) => h.id === hazardId);
    if (!hazard) return NextResponse.json({ error: "Hazard not found." }, { status: 404 });

    const result = await visualizeFix({
      videoFile: videoPath(id),
      videoId: id,
      timestampS: hazard.timestamp_s,
      editPrompt: hazard.omni_edit_prompt,
    });
    const latest = (await readReport(id)) ?? report;
    await writeReport({ ...latest, clips: { ...latest.clips, [hazardId]: result.clip } });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    await logError("visualize", err);
    const msg = String(err instanceof Error ? err.message : err);
    const error = /turned off|limit reached/i.test(msg)
      ? "Before/after views are turned off right now."
      : /no video|safety filter/i.test(msg)
        ? "This clip couldn't be edited. Try another finding."
        : "Couldn't make the before/after view. Try again in a minute.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
