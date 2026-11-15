import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
import { vertexClient, ANALYSIS_MODEL, extractJson } from "./genai";
import { LISTEN_RESPONSE_SCHEMA, type Report } from "./schema";
import { listenPrompt, type ListenLang } from "./prompts";
import { bestProgram, buildPlan, callForHelp, firstSentence } from "./plan";
import { AUDIO, ensureDirs, exists, safeName } from "./storage";
import { synthesize, TTS_MODEL } from "./tts";

const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const Script = z.object({ script: z.string().min(40).max(5000) });

/**
 * What the model may say. Only plan facts go in: no URLs, phone numbers or addresses, so it can't read them out.
 * Program claims are pre-decided here from verified fields (does_the_work / cost_to_family).
 */
export function planForSpeech(report: Report) {
  const plan = buildPlan(report);
  const item = (h: Report["hazards"][number]) => ({
    title: h.title,
    fix: firstSentence(h.fix),
    ...(h.personal_note ? { personal_note: h.personal_note } : {}),
  });
  return {
    today_free: plan.today.map(item),
    under_50: plan.cheap.map((h) => ({
      ...item(h),
      price_usd: { low: report.prices[h.id]?.cost_low_usd, high: report.prices[h.id]?.cost_high_usd },
    })),
    get_help: plan.help.map((h) => {
      const p = bestProgram(report.funding, h.id);
      const says = !p
        ? null
        : p.does_the_work && p.cost_to_family === "free"
          ? "may_do_it_free"
          : p.does_the_work
            ? "may_do_it"
            : "may_help_pay";
      return { ...item(h), program_says: says };
    }),
    call_for_help: callForHelp(report.funding)?.is_area_agency_on_aging ? "your local Area Agency on Aging" : "the Eldercare Locator",
  };
}

/** Belt and braces after Zod: strip anything the prompt forbids. */
function clean(script: string): string {
  return script
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "")
    .replace(/[*#_`>|]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function writeScript(report: Report, lang: ListenLang): Promise<string> {
  const res = await vertexClient().models.generateContent({
    model: ANALYSIS_MODEL,
    contents: listenPrompt(lang, JSON.stringify(planForSpeech(report), null, 2)),
    config: {
      responseMimeType: "application/json",
      responseSchema: LISTEN_RESPONSE_SCHEMA,
      temperature: 0.4,
      abortSignal: AbortSignal.timeout(90_000),
    },
  });
  return clean(Script.parse(extractJson(res.text ?? "")).script);
}

/**
 * Script + audio for one report and language. Two cache layers so repeat plays cost nothing:
 *  - <id>-<lang>-<planHash>.json remembers the script written for exactly this plan (no repeat script call)
 *  - <id>-<lang>-<sha1(script)>.wav is the audio for exactly that script (no repeat TTS call)
 */
export async function listen(report: Report, lang: ListenLang): Promise<{ audioUrl: string; script: string }> {
  await ensureDirs();
  const id = safeName(report.id);
  const planHash = sha1(JSON.stringify({ plan: planForSpeech(report), lang, ANALYSIS_MODEL, TTS_MODEL })).slice(0, 16);
  const scriptFile = path.join(AUDIO, `${id}-${lang}-${planHash}.json`);

  let script: string | null = null;
  try {
    script = Script.parse(JSON.parse(await fs.readFile(scriptFile, "utf8"))).script;
  } catch {
    script = await writeScript(report, lang);
    await fs.writeFile(scriptFile, JSON.stringify({ script }, null, 2));
  }

  const name = `${id}-${lang}-${sha1(script)}.wav`;
  const wavPath = path.join(AUDIO, name);
  if (!(await exists(wavPath))) {
    const wav = await synthesize(script);
    await fs.writeFile(wavPath, wav);
    await fs.writeFile(wavPath.replace(/\.wav$/, ".txt"), script);
  }
  return { audioUrl: `/api/audio/${name}`, script };
}
