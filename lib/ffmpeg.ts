import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`)),
    );
  });
}

/** Compress an upload to 720p H.264, no audio, max 60 s. Keeps requests small enough to send inline. */
export async function compress(input: string, output: string) {
  await run([
    "-y", "-i", input, "-t", "60",
    "-vf", "scale=-2:'min(720,ih)'",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    output,
  ]);
}

/** Cut a short clip (Omni Flash edits accept 10 s or less). */
export async function trim(input: string, output: string, startS: number, durationS: number) {
  await run([
    "-y", "-ss", String(Math.max(0, startS)), "-i", input, "-t", String(durationS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    output,
  ]);
}

/** Duration in seconds, parsed from ffmpeg's banner (avoids needing ffprobe). */
export function durationSeconds(input: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-i", input]);
    let s = "";
    p.stderr.on("data", (d) => (s += d.toString()));
    p.on("error", () => resolve(null));
    p.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
  });
}

/** Grab one JPEG frame at a timestamp (used to show the evidence for each finding). */
export async function frameAt(input: string, output: string, atS: number) {
  await run(["-y", "-ss", String(Math.max(0, atS)), "-i", input, "-frames:v", "1", "-vf", "scale=-2:480", "-q:v", "4", output]);
}
