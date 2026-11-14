import path from "path";
import { CLIPS, safeName } from "@/lib/storage";
import { serveMp4 } from "@/lib/serveVideo";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  try {
    return await serveMp4(path.join(CLIPS, safeName(name)), req);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
