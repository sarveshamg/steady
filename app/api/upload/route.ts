import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, UPLOADS, ensureDirs, exists, newId, readReport, videoPath, writeReport } from "@/lib/storage";
import crypto from "crypto";
import { SECONDS_PER_PHOTO, compress, durationSeconds, photosToVideo } from "@/lib/ffmpeg";
import { Resident } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 300 * 1024 * 1024;
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
// HEIC needs a decoder ffmpeg-static doesn't reliably have, and sharp isn't a direct dependency: reject it clearly.
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
const photoExt = (f: File) =>
  PHOTO_TYPES[f.type] ?? (/\.(jpe?g)$/i.test(f.name) ? "jpg" : /\.png$/i.test(f.name) ? "png" : /\.webp$/i.test(f.name) ? "webp" : null);

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("video");
    const photos = form.getAll("photos").filter((p): p is File => p instanceof File);
    const location = String(form.get("location") ?? "").trim().slice(0, 200) || null;
    let resident: Resident | null = null;
    try {
      resident = Resident.safeParse(JSON.parse(String(form.get("resident") ?? "null"))).data ?? null;
    } catch {
      resident = null;
    }
    if (file instanceof File && photos.length > 0) {
      return NextResponse.json({ error: "Use either one video or photos, not both." }, { status: 400 });
    }
    if (photos.length > 0) return await uploadPhotos(photos, resident, location);
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

/**
 * Photos: validate, turn them into a slideshow MP4 (3 s each), then carry on exactly like an uploaded video:
 * same report shape, same dedupe-by-hash (hash of all photo bytes, in order), same analysis pipeline.
 */
async function uploadPhotos(photos: File[], resident: Resident | null, location: string | null) {
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos at a time.` }, { status: 400 });
  }
  for (const p of photos) {
    if (isHeic(p)) return NextResponse.json({ error: "HEIC photos aren't supported. Please use JPG or PNG." }, { status: 400 });
    if (!photoExt(p)) return NextResponse.json({ error: "Please use JPG, PNG or WebP photos." }, { status: 400 });
    if (p.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Each photo must be under 15 MB." }, { status: 413 });
    }
  }
  await ensureDirs();
  const buffers = await Promise.all(photos.map(async (p) => Buffer.from(await p.arrayBuffer())));

  const hash = crypto.createHash("sha256");
  for (const b of buffers) hash.update(crypto.createHash("sha256").update(b).digest());
  const key = `photos:${hash.digest("hex")}`;
  const indexFile = path.join(DATA_DIR, "video-index.json");
  let index: Record<string, string> = {};
  try {
    index = JSON.parse(await fs.readFile(indexFile, "utf8"));
  } catch {}
  const existing = index[key] ? await readReport(index[key]) : null;
  if (existing && (await exists(videoPath(existing.id)))) {
    const sameResident = JSON.stringify(existing.resident ?? null) === JSON.stringify(resident ?? null);
    if (!sameResident) {
      await writeReport({ ...existing, resident, hazards: [], prices: {}, clips: {}, local: {}, funding: null });
    }
    return NextResponse.json({ id: existing.id, duplicate: true, rechecking: !sameResident });
  }

  const id = newId();
  const dir = await fs.mkdtemp(path.join(UPLOADS, `${id}-photos-`));
  try {
    const files = await Promise.all(
      photos.map(async (p, i) => {
        const f = path.join(dir, `${String(i + 1).padStart(2, "0")}.${photoExt(p)}`);
        await fs.writeFile(f, buffers[i]);
        return f;
      }),
    );
    try {
      await photosToVideo(files, videoPath(id), SECONDS_PER_PHOTO);
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "We couldn't read one of those photos. Try JPG or PNG." }, { status: 400 });
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  await writeReport({
    id,
    source: { type: "photos", count: photos.length, secondsPerPhoto: SECONDS_PER_PHOTO },
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
  index[key] = id;
  await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
  return NextResponse.json({ id });
}
