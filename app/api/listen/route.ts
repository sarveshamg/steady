import { NextResponse } from "next/server";
import { logError, readReport } from "@/lib/storage";
import { applyResidentRules } from "@/lib/filters";
import { listen } from "@/lib/listen";
import { LISTEN_LANGUAGES, type ListenLang } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

/** POST { id, lang } → { audioUrl, script }: the Simple plan read aloud (cached per plan + language). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id: string; lang?: string };
    const lang = (body.lang ?? "en") as ListenLang;
    if (!(lang in LISTEN_LANGUAGES)) return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
    const report = await readReport(body.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const clean = { ...report, hazards: applyResidentRules(report.hazards, report.resident) };
    return NextResponse.json(await listen(clean, lang));
  } catch (err) {
    await logError("listen", err);
    const msg = String(err instanceof Error ? err.message : err);
    if (/\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg)) {
      return NextResponse.json({ error: "The voice service is busy. Wait a minute and try again." }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't prepare the audio right now. The plan is all on screen." }, { status: 500 });
  }
}
