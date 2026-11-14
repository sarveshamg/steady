import { promises as fs } from "fs";
import type { GoogleGenAI, Part } from "@google/genai";
import { GoogleGenAI as Client } from "@google/genai";
import { vertexClient, ANALYSIS_MODEL, extractJson } from "./genai";
import { ANALYSIS_RESPONSE_SCHEMA, AnalysisFromModel, Hazard, Resident } from "./schema";
import { ANALYZE_PROMPT, residentContext } from "./prompts";

const PRIORITY_ORDER = { urgent: 0, soon: 1, nice_to_have: 2 } as const;
// Long house tours: only analyse the first few minutes to keep cost and latency predictable.
const YOUTUBE_MAX_SECONDS = 300;

type Result = { rooms: string[]; hazards: Hazard[] };

async function runAnalysis(ai: GoogleGenAI, videoPart: Part, resident?: Resident | null): Promise<Result> {
  const prompt = ANALYZE_PROMPT + residentContext(resident);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: [{ role: "user", parts: [videoPart, { text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });
      const raw = extractJson(res.text ?? "") as { hazards?: Array<Record<string, unknown>> };
      for (const h of raw.hazards ?? []) {
        if (typeof h.confidence === "number" && h.confidence > 1) h.confidence = h.confidence / 100;
        if (typeof h.timestamp_s === "number" && h.timestamp_s < 0) h.timestamp_s = 0;
      }
      const parsed = AnalysisFromModel.parse(raw);
      const hazards = parsed.hazards
        .map((h, i) => ({ ...h, id: `h${i + 1}` }))
        .sort(
          (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.timestamp_s - b.timestamp_s,
        );
      return { rooms: parsed.rooms_covered, hazards };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Analysis failed after retry: ${String(lastError)}`);
}

/** Analyse a compressed upload, sent inline. */
export async function analyzeVideo(videoFile: string, resident?: Resident | null): Promise<Result> {
  const data = (await fs.readFile(videoFile)).toString("base64");
  return runAnalysis(vertexClient(), { inlineData: { mimeType: "video/mp4", data } }, resident);
}

/**
 * Analyse a public YouTube video by URL (Gemini fetches it; nothing is downloaded here).
 * Tries Vertex first; if that fails and GEMINI_API_KEY is set, retries via the Gemini API.
 */
export async function analyzeYouTube(url: string, resident?: Resident | null): Promise<Result> {
  const part: Part = {
    fileData: { fileUri: url, mimeType: "video/mp4" },
    videoMetadata: { startOffset: "0s", endOffset: `${YOUTUBE_MAX_SECONDS}s` },
  };
  try {
    return await runAnalysis(vertexClient(), part, resident);
  } catch (vertexErr) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw vertexErr;
    return runAnalysis(new Client({ apiKey: key }), part, resident);
  }
}
