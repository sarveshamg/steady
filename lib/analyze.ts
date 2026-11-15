import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { frameAt, durationSeconds } from "./ffmpeg";
import type { GoogleGenAI, Part } from "@google/genai";
import { GoogleGenAI as Client } from "@google/genai";
import { vertexClient, ANALYSIS_MODEL, extractJson } from "./genai";
import { ANALYSIS_RESPONSE_SCHEMA, AnalysisFromModel, Hazard, Resident, VERIFY_RESPONSE_SCHEMA, FRAME_CHECK_SCHEMA } from "./schema";
import { ANALYZE_PROMPT, residentContext, verifyPrompt } from "./prompts";
import { applyResidentRules } from "./filters";
import { z } from "zod";

const PRIORITY_ORDER = { urgent: 0, soon: 1, nice_to_have: 2 } as const;
// Long house tours: only analyse the first few minutes to keep cost and latency predictable.
const YOUTUBE_MAX_SECONDS = 300;
// Per-attempt limit. Normal runs take ~15 s for an upload; YouTube tours take longer.
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS) || 120_000;

type Result = { rooms: string[]; hazards: Hazard[] };

// Items the model itself rates below this are probably not real hazards: never shown.
const MIN_CONFIDENCE = 0.5;
const FALLBACK_MODEL = process.env.FALLBACK_ANALYSIS_MODEL || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isOverloaded(err: unknown) {
  return /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(String(err));
}

async function runAnalysis(
  ai: GoogleGenAI,
  videoPart: Part,
  resident?: Resident | null,
  frameSource?: string,
): Promise<Result> {
  const prompt = ANALYZE_PROMPT + residentContext(resident);
  let lastError: unknown;
  // Overload (503/429) gets backoff retries (and the fallback model, if set); bad output gets one plain retry.
  const plan = [ANALYSIS_MODEL, ANALYSIS_MODEL, ANALYSIS_MODEL, ...(FALLBACK_MODEL ? [FALLBACK_MODEL] : [])];
  for (let attempt = 0; attempt < plan.length; attempt++) {
    if (attempt > 0) {
      if (!isOverloaded(lastError) && attempt > 1) break;
      await sleep(isOverloaded(lastError) ? 3000 * 2 ** (attempt - 1) : 2000);
    }
    try {
      const res = await ai.models.generateContent({
        model: plan[attempt],
        contents: [{ role: "user", parts: [videoPart, { text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_RESPONSE_SCHEMA,
          temperature: 0.1,
          // When overloaded, the Gemini API can hold a request ~5 min before a 503. Fail fast instead.
          abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
        },
      });
      const raw = extractJson(res.text ?? "") as { hazards?: Array<Record<string, unknown>> };
      for (const h of raw.hazards ?? []) {
        if (typeof h.confidence === "number" && h.confidence > 1) h.confidence = h.confidence / 100;
        if (typeof h.timestamp_s === "number" && h.timestamp_s < 0) h.timestamp_s = 0;
      }
      const parsed = AnalysisFromModel.parse(raw);
      const seen = new Set<string>();
      const hazards = parsed.hazards
        .filter((h) => h.confidence >= MIN_CONFIDENCE && (h.evidence ?? "").trim().length > 0)
        .filter((h) => {
          // Same category within ~3 s is the same thing reported twice.
          const key = `${h.category}:${Math.round(h.timestamp_s / 3)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((h, i) => ({ ...h, id: `h${i + 1}` }))
        .sort(
          (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.timestamp_s - b.timestamp_s,
        );
      const rooms = parsed.rooms_covered.map((r) => r.replace(/[_-]+/g, " ").trim()).filter(Boolean);
      const cleaned = hazards.map((h) => ({ ...h, room: h.room.replace(/[_-]+/g, " ").trim() }));
      // Person-specific hard rules (e.g. no second-handrail findings for someone who walks on their own).
      const forPerson = applyResidentRules(cleaned, resident);
      const verified = await verifyFindings(ai, videoPart, forPerson);
      return { rooms, hazards: frameSource ? await frameCheck(ai, frameSource, verified) : verified };
    } catch (err) {
      lastError = err;
      // A timed-out request will most likely time out again; don't double the wait.
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(`ANALYSIS_TIMEOUT: Gemini did not answer within ${ANALYSIS_TIMEOUT_MS / 1000}s`);
      }
    }
  }
  throw new Error(
    isOverloaded(lastError)
      ? "OVERLOADED: Gemini is busy right now. Wait a minute and try again."
      : `Analysis failed after retry: ${String(lastError)}`,
  );
}

const VerifyResult = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      visible: z.boolean(),
      corrected_timestamp_s: z.number().nullable().optional(),
      reason: z.string().optional(),
    }),
  ),
});

/**
 * Second, independent pass: a fresh request re-watches the video and must confirm each finding is
 * actually visible where claimed. Unconfirmed findings are dropped. If the check itself fails
 * (e.g. overload), findings are kept but marked verified: false so the UI can say so.
 */
async function verifyFindings(ai: GoogleGenAI, videoPart: Part, hazards: Hazard[]): Promise<Hazard[]> {
  if (hazards.length === 0) return hazards;
  try {
    const res = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            videoPart,
            {
              text: verifyPrompt(
                hazards.map((h) => ({ id: h.id, timestamp_s: h.timestamp_s, title: h.title, evidence: h.evidence ?? "" })),
              ),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: VERIFY_RESPONSE_SCHEMA,
        temperature: 0,
        abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      },
    });
    const { results } = VerifyResult.parse(extractJson(res.text ?? ""));
    const byId = new Map(results.map((r) => [r.id, r]));
    return hazards
      .filter((h) => byId.get(h.id)?.visible === true)
      .map((h) => {
        const r = byId.get(h.id)!;
        const t = typeof r.corrected_timestamp_s === "number" && r.corrected_timestamp_s >= 0 ? r.corrected_timestamp_s : h.timestamp_s;
        return { ...h, timestamp_s: t, verified: true };
      });
  } catch {
    return hazards.map((h) => ({ ...h, verified: false }));
  }
}

const FrameCheck = z.object({
  visible: z.boolean(),
  best_frame: z.number().int().nullable().optional(),
  reason: z.string().optional(),
});

/**
 * Third guard, uploads only: grab the actual frames around each finding's timestamp and require the described
 * thing to be visible in at least one of them. The frame that shows it becomes the finding's timestamp, so the
 * frame shown in the UI is the one that was checked. Findings that fail are dropped; if the check can't run
 * for a finding (API error), that finding keeps its earlier status.
 */
async function frameCheck(ai: GoogleGenAI, videoFile: string, hazards: Hazard[]): Promise<Hazard[]> {
  if (hazards.length === 0) return hazards;
  const duration = (await durationSeconds(videoFile)) ?? Infinity;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "steady-frames-"));
  try {
    const checked = await Promise.all(
      hazards.map(async (h): Promise<Hazard | null> => {
        const times = [h.timestamp_s - 1.5, h.timestamp_s, h.timestamp_s + 1.5].map((t) =>
          Math.max(0, Math.min(t, duration - 0.2)),
        );
        try {
          const parts: Part[] = [];
          for (const [i, t] of times.entries()) {
            const file = path.join(dir, `${crypto.randomBytes(4).toString("hex")}-${i}.jpg`);
            await frameAt(videoFile, file, t);
            parts.push({ text: `Frame ${i} (at ${t.toFixed(1)}s):` });
            parts.push({ inlineData: { mimeType: "image/jpeg", data: (await fs.readFile(file)).toString("base64") } });
          }
          parts.push({
            text: `These are frames from a home walkthrough video. A reviewer claims:
"${h.title}". Evidence they gave: "${h.evidence ?? ""}".
Is the specific thing described clearly visible in at least one of these frames? Be strict: if it is not visible,
too small or blurry to judge, or the description goes beyond what the frames show, answer visible=false.
If visible, best_frame is the index (0, 1 or 2) of the frame that shows it most clearly.
Reply as JSON: {"visible": true/false, "best_frame": 0|1|2 or null, "reason": "one short sentence"}`,
          });
          const res = await ai.models.generateContent({
            model: ANALYSIS_MODEL,
            contents: [{ role: "user", parts }],
            config: {
              responseMimeType: "application/json",
              responseSchema: FRAME_CHECK_SCHEMA,
              temperature: 0,
              abortSignal: AbortSignal.timeout(60_000),
            },
          });
          const r = FrameCheck.parse(extractJson(res.text ?? ""));
          if (!r.visible) return null;
          const idx = typeof r.best_frame === "number" && r.best_frame >= 0 && r.best_frame <= 2 ? r.best_frame : 1;
          return { ...h, timestamp_s: Math.round(times[idx] * 10) / 10, verified: h.verified !== false };
        } catch {
          return h; // couldn't check: keep as-is (verified flag already reflects the earlier pass)
        }
      }),
    );
    return checked.filter((h): h is Hazard => h !== null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Analyse a compressed upload, sent inline. */
export async function analyzeVideo(videoFile: string, resident?: Resident | null): Promise<Result> {
  const data = (await fs.readFile(videoFile)).toString("base64");
  return runAnalysis(vertexClient(), { inlineData: { mimeType: "video/mp4", data } }, resident, videoFile);
}

/**
 * Analyse a public YouTube video by URL (Gemini fetches it; nothing is downloaded here).
 * Vertex rejects YouTube URLs in practice, so the Gemini API (GEMINI_API_KEY) is tried first.
 */
export async function analyzeYouTube(url: string, resident?: Resident | null): Promise<Result> {
  const part: Part = {
    fileData: { fileUri: url, mimeType: "video/mp4" },
    videoMetadata: { startOffset: "0s", endOffset: `${YOUTUBE_MAX_SECONDS}s` },
  };
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key) return runAnalysis(new Client({ apiKey: key, vertexai: false }), part, resident);
  try {
    return await runAnalysis(vertexClient(), part, resident);
  } catch {
    throw new Error(
      "YOUTUBE_NEEDS_KEY: YouTube links need a Gemini API key. Create one at aistudio.google.com/apikey for project steady-devfest, add GEMINI_API_KEY=... to .env.local, and restart npm run dev.",
    );
  }
}
