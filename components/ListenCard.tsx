"use client";

import { useState } from "react";

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
      const res = await fetch("/api/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId, lang }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't prepare the audio.");
      setResult({ ...json, lang });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare the audio.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="listen-title" className="space-y-4 rounded-3xl bg-card p-5 text-lg ring-1 ring-line">
      <h2 id="listen-title" className="text-2xl font-bold">
        Listen to this plan
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="listen-lang" className="font-semibold">
            Language
          </label>
          <select
            id="listen-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
            className="min-h-12 rounded-full border-2 border-line bg-card px-4 text-lg"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={listen}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-8 text-xl font-semibold text-white disabled:opacity-60"
        >
          <span aria-hidden>{loading ? "⏳" : "▶"}</span>
          {loading ? "Preparing audio…" : "Listen"}
        </button>
      </div>
      <p className="sr-only" role="status">
        {loading ? "Preparing audio. This can take up to a minute." : result ? "Audio ready." : ""}
      </p>
      {error && <p className="text-urgent">{error}</p>}
      {result && (
        <div className="space-y-3">
          {/* Captions: the full script is shown as text right below the player. */}
          <audio key={result.audioUrl} controls autoPlay src={result.audioUrl} className="w-full" aria-label="Plan read aloud" />
          <div className="rounded-2xl bg-paper p-4 ring-1 ring-line" lang={result.lang}>
            <p className="mb-1 text-lg font-semibold uppercase tracking-wide text-muted">What it says</p>
            <p className="whitespace-pre-line text-lg leading-relaxed">{result.script}</p>
          </div>
          <p className="text-lg text-muted">Voice made with AI (Gemini text-to-speech).</p>
        </div>
      )}
    </section>
  );
}
