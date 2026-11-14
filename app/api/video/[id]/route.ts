import { videoPath } from "@/lib/storage";
import { serveMp4 } from "@/lib/serveVideo";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return await serveMp4(videoPath(id), req);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
