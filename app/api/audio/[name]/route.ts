import path from "path";
import { AUDIO, safeName } from "@/lib/storage";
import { serveFile } from "@/lib/serveVideo";

export const runtime = "nodejs";

/** GET a generated read-aloud WAV, with Range support so the audio player can scrub. */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  try {
    if (!name.endsWith(".wav")) return new Response("Not found", { status: 404 });
    return await serveFile(path.join(AUDIO, safeName(name)), req, "audio/wav");
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
