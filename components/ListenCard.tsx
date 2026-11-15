"use client";

import { useState } from "react";
import { buttonClass, inputClass, postJson } from "./ui";
import { PlayIcon, SpinnerIcon } from "./icons";

const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文" },
  { code: "tl", label: "Tagalog" },
  { code: "ko", label: "한국어" },
] as const;

/** "Listen to this plan": the Simple plan read aloud (Gemini TTS), with the script shown as captions. */
export function ListenCard({ reportId }: { reportId: string }) {
  const [lang, setLang] = useState<(typeof LANGS)[number]["code"]>("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ audioUrl: string; script: string; lang: string } | null>(null);

  async function listen() {
    setLoading(true);
    setError(null);
    try {
      const json = await postJson<{ audioUrl: string; script: string }>(
        "/api/listen",
        { id: reportId, lang },
        "Couldn't prepare the audio. Everything is on screen below.",
      );
      setResult({ ...json, lang });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare the audio. Everything is on screen below.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="listen-title" className="space-y-4">
      <h2 id="listen-title" className="text-xl">
        Listen to this plan
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="listen-lang" className="block text-lg">
            Language
          </label>
          <select
            id="listen-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
            className={`${inputClass} min-h-12 w-auto pr-8 text-lg`}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={listen} disabled={loading} aria-busy={loading} className={buttonClass("primary", "lg")}>
          {loading ? <SpinnerIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          {loading ? "Preparing audio…" : "Listen"}
        </button>
      </div>
      <p className="sr-only" role="status">
        {loading ? "Preparing audio. This can take up to a minute." : result ? "Audio ready." : ""}
      </p>
      {error && (
        <p className="text-lg font-medium text-urgent" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-3">
          {/* Captions: the full script is shown as text right below the player. */}
          <audio key={result.audioUrl} controls autoPlay src={result.audioUrl} className="w-full" aria-label="Plan read aloud" />
          <p className="whitespace-pre-line rounded-md bg-page px-4 py-3 text-lg" lang={result.lang}>
            {result.script}
          </p>
          <p className="text-lg text-muted">AI voice (Gemini text-to-speech).</p>
        </div>
      )}
    </section>
  );
}
