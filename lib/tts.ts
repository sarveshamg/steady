import { GoogleAuth } from "google-auth-library";

/**
 * Gemini TTS (verified against Google's docs, Nov 2026):
 *  - Vertex AI: generateContent; style goes in parts[].speechMetadata.style, voice in
 *    generationConfig.speechConfig.voiceConfig.voice; returns WAV in inlineData.
 *  - Gemini API (fallback): Interactions API; style is a text annotation {type: "speech_metadata"},
 *    voice in generation_config.speech_config: [{voice}]; returns WAV in output_audio / steps[].content[].
 * Called over REST because the installed @google/genai (1.x) drops speechMetadata / voiceConfig.voice.
 * If raw PCM comes back instead (older models), it is wrapped in a WAV header (16-bit mono, 24 kHz).
 */

export const TTS_MODEL = process.env.TTS_MODEL || "gemini-3.8-flash-tts";
const VOICE = "Kore";
const STYLE = "calm, warm and reassuring";

type Audio = { data: string; mimeType: string };

let auth: GoogleAuth | null = null;

async function viaVertex(script: string): Promise<Audio> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set.");
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${TTS_MODEL}:generateContent`;
  try {
    const res = await client.request<{
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    }>({
      url,
      method: "POST",
      timeout: 120_000,
      data: {
        contents: [{ role: "user", parts: [{ text: script, speechMetadata: { style: STYLE } }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { voice: VOICE } } },
      },
    });
    const part = res.data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error("TTS returned no audio.");
    return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "audio/wav" };
  } catch (err) {
    const e = err as { status?: number; response?: { status?: number; data?: unknown } };
    const status = e.response?.status ?? e.status;
    const detail = JSON.stringify(e.response?.data ?? String(err)).slice(0, 400);
    throw Object.assign(new Error(`Vertex TTS ${status ?? ""}: ${detail}`), { status });
  }
}

async function viaGeminiApi(script: string, key: string): Promise<Audio> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: script, annotations: [{ type: "speech_metadata", style: STYLE }] }],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICE }] },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  // Error bodies from Google never echo the key; the key itself is only ever in the request header.
  if (!res.ok) throw new Error(`Gemini API TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as {
    output_audio?: { data?: string; mime_type?: string };
    steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string }> }>;
  };
  if (json.output_audio?.data) return { data: json.output_audio.data, mimeType: json.output_audio.mime_type ?? "audio/wav" };
  const audio = (json.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === "audio" && c.data)
    .at(-1);
  if (!audio?.data) throw new Error("TTS returned no audio.");
  return { data: audio.data, mimeType: audio.mime_type ?? "audio/wav" };
}

/** Wrap raw 16-bit little-endian mono PCM in a WAV header; pass WAV through untouched. */
export function toWav(bytes: Buffer, mimeType: string): Buffer {
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return bytes;
  const rate = Number(mimeType.match(/rate=(\d+)/)?.[1]) || 24_000;
  const channels = 1;
  const bits = 16;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + bytes.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE((rate * channels * bits) / 8, 28); // byte rate
  header.writeUInt16LE((channels * bits) / 8, 32); // block align
  header.writeUInt16LE(bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([header, bytes]);
}

/** Vertex first; if the model isn't available there (404 / unsupported model), the Gemini API with GEMINI_API_KEY. */
export async function synthesize(script: string): Promise<Buffer> {
  let audio: Audio;
  try {
    audio = await viaVertex(script);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg = String(err instanceof Error ? err.message : err);
    const unavailable = status === 404 || (status === 400 && /model|not supported|not found|unsupported/i.test(msg));
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!unavailable || !key) throw err;
    audio = await viaGeminiApi(script, key);
  }
  return toWav(Buffer.from(audio.data, "base64"), audio.mimeType);
}
