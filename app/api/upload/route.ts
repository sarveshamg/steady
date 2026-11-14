import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { UPLOADS, ensureDirs, newId, videoPath, writeReport } from "@/lib/storage";
import { compress, durationSeconds } from "@/lib/ffmpeg";
import { Resident } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 300 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("video");
    let resident: Resident | null = null;
    try {
      resident = Resident.safeParse(JSON.parse(String(form.get("resident") ?? "null"))).data ?? null;
    } catch {
      resident = null;
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No video in the upload." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That video is too large. Try a clip under 60 seconds." }, { status: 413 });
    }
    await ensureDirs();
    const id = newId();
    const raw = path.join(UPLOADS, `${id}-raw`);
    await fs.writeFile(raw, Buffer.from(await file.arrayBuffer()));
    await compress(raw, videoPath(id));
    await fs.unlink(raw).catch(() => {});

    await writeReport({
      id,
      source: { type: "upload" },
      resident,
      created_at: new Date().toISOString(),
      duration_s: await durationSeconds(videoPath(id)),
      rooms_covered: [],
      hazards: [],
      prices: {},
      clips: {},
    });
    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not process that video." }, { status: 500 });
  }
}
