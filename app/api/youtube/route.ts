import { NextResponse } from "next/server";
import { newId, writeReport } from "@/lib/storage";
import { parseYouTube } from "@/lib/youtube";
import { Resident } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { url, resident: rawResident } = (await req.json().catch(() => ({}))) as { url?: string; resident?: unknown };
  const resident = Resident.safeParse(rawResident).data ?? null;
  const yt = url ? parseYouTube(url) : null;
  if (!yt) {
    return NextResponse.json({ error: "That doesn't look like a YouTube video link." }, { status: 400 });
  }
  const id = newId();
  await writeReport({
    id,
    source: { type: "youtube", url: yt.url, videoId: yt.videoId },
    resident,
    created_at: new Date().toISOString(),
    duration_s: null,
    rooms_covered: [],
    hazards: [],
    prices: {},
    clips: {},
  });
  return NextResponse.json({ id });
}
