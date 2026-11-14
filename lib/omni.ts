import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { omniClient, OMNI_MODEL } from "./genai";
import { CLIPS, DATA_DIR, ensureDirs, exists } from "./storage";
import { trim } from "./ffmpeg";
import { omniPrompt } from "./prompts";

const COUNTER = path.join(DATA_DIR, "omni-calls.json");
const CLIP_SECONDS = 8; // Omni edits accept uploaded clips of 10 s or less.

export function omniEnabled() {
  return process.env.ENABLE_OMNI === "true";
}

async function callsSoFar(): Promise<number> {
  try {
    return JSON.parse(await fs.readFile(COUNTER, "utf8")).calls ?? 0;
  } catch {
    return 0;
  }
}

export async function omniBudget() {
  const max = Number(process.env.OMNI_MAX_CALLS || 10);
  const used = await callsSoFar();
  return { enabled: omniEnabled(), used, max, remaining: Math.max(0, max - used) };
}

/**
 * Show the fix installed: cut ~8 s around the hazard, ask Omni Flash to edit it.
 * Cached by (video, hazard time, prompt). Never called in loops or tests.
 */
export async function visualizeFix(opts: {
  videoFile: string;
  videoId: string;
  timestampS: number;
  editPrompt: string;
}): Promise<{ clip: string; cached: boolean }> {
  await ensureDirs();
  const key = crypto
    .createHash("sha256")
    .update(`${opts.videoId}|${opts.timestampS.toFixed(1)}|${opts.editPrompt}`)
    .digest("hex")
    .slice(0, 16);
  const beforeName = `${key}-before.mp4`;
  const afterName = `${key}-after.mp4`;
  const beforePath = path.join(CLIPS, beforeName);
  const afterPath = path.join(CLIPS, afterName);

  if (await exists(afterPath)) return { clip: key, cached: true };

  const budget = await omniBudget();
  if (!budget.enabled) throw new Error("Omni Flash is turned off (set ENABLE_OMNI=true to generate clips).");
  if (budget.remaining <= 0) throw new Error(`Omni Flash call limit reached (${budget.max}).`);

  const start = Math.max(0, opts.timestampS - 3);
  await trim(opts.videoFile, beforePath, start, CLIP_SECONDS);

  // Count the attempt before calling: failed calls can still cost money.
  await fs.writeFile(COUNTER, JSON.stringify({ calls: budget.used + 1 }));

  const ai = omniClient();
  const data = (await fs.readFile(beforePath)).toString("base64");
  // The Interactions API may not be in the SDK's types yet on every version.
  const interactions = (ai as unknown as { interactions: { create: (req: unknown) => Promise<any> } })
    .interactions;
  if (!interactions) throw new Error("This @google/genai version has no interactions API. Run: npm i @google/genai@latest");

  const result = await interactions.create({
    model: OMNI_MODEL,
    input: [
      { type: "video", data, mime_type: "video/mp4" },
      { type: "text", text: omniPrompt(opts.editPrompt) },
    ],
    response_format: { type: "video", resolution: "720p" },
  });

  const out = result?.output_video;
  if (out?.data) {
    await fs.writeFile(afterPath, Buffer.from(out.data, "base64"));
  } else if (out?.uri) {
    await (ai as any).files.download({ file: out, downloadPath: afterPath });
  } else {
    throw new Error("Omni Flash returned no video (it may have been blocked by a safety filter).");
  }
  return { clip: key, cached: false };
}
