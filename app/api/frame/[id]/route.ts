import path from "path";
import { promises as fs } from "fs";
import { DATA_DIR, exists, safeName, videoPath } from "@/lib/storage";
import { frameAt } from "@/lib/ffmpeg";

export const runtime = "nodejs";

/** GET /api/frame/<reportId>?t=12.5 → the video frame at that second (uploads only). Cached on disk. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const t = Math.max(0, Math.round(Number(new URL(req.url).searchParams.get("t") ?? "0") * 10) / 10);
    if (!Number.isFinite(t)) return new Response("Bad time", { status: 400 });
    const dir = path.join(DATA_DIR, "frames");
    await fs.mkdir(dir, { recursive: true });
    const out = path.join(dir, `${safeName(id)}-${t.toFixed(1)}.jpg`);
    if (!(await exists(out))) {
      if (!(await exists(videoPath(id)))) return new Response("Not found", { status: 404 });
      await frameAt(videoPath(id), out, t);
    }
    return new Response(new Uint8Array(await fs.readFile(out)), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new Response("Could not extract frame", { status: 500 });
  }
}
