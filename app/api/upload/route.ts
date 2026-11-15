import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, UPLOADS, ensureDirs, exists, newId, readReport, videoPath, writeReport } from "@/lib/storage";
import crypto from "crypto";
import { compress, durationSeconds } from "@/lib/ffmpeg";
import { Resident } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 300 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("video");
    const location = String(form.get("location") ?? "").trim().slice(0, 200) || null;
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
    const bytes = Buffer.from(await file.arrayBuffer());

    // Same video uploaded again: reuse the existing report (and its saved video) instead of a new one.
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const indexFile = path.join(DATA_DIR, "video-index.json");
    let index: Record<string, string> = {};
    try {
      index = JSON.parse(await fs.readFile(indexFile, "utf8"));
    } catch {}
    const existingId = index[hash];
    const existing = existingId ? await readReport(existingId) : null;
    if (existing && (await exists(videoPath(existing.id)))) {
      const sameResident = JSON.stringify(existing.resident ?? null) === JSON.stringify(resident ?? null);
      if (!sameResident) {
        // Different person: keep the video, clear results so it re-checks for them.
        await writeReport({ ...existing, resident, hazards: [], prices: {}, clips: {}, local: {}, funding: null });
      }
      return NextResponse.json({ id: existing.id, duplicate: true, rechecking: !sameResident });
    }

    const id = newId();
    const raw = path.join(UPLOADS, `${id}-raw`);
    await fs.writeFile(raw, bytes);
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
      location,
      location_geo: null,
      location_area: null,
      funding: null,
      local: {},
    });
    index[hash] = id;
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not process that video." }, { status: 500 });
  }
}
