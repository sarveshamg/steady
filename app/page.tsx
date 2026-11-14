"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Resident } from "@/lib/schema";
import { DEFAULT_RESIDENT, ResidentForm } from "@/components/ResidentForm";

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [resident, setResident] = useState<Resident>(DEFAULT_RESIDENT);

  async function submitYouTube(e: React.FormEvent) {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ytUrl, resident }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That link didn't work");
      router.push(`/report/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That link didn't work");
      setBusy(false);
    }
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("video", file);
      body.append("resident", JSON.stringify(resident));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      router.push(`/report/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
      <section>
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-sage">For families of older adults</p>
        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">
          Film a room.
          <br />
          See what could cause a fall.
        </h1>
        <p className="mb-6 max-w-prose text-lg text-muted">
          Most falls at home start with something small: a loose rug, a dark hallway, nothing to hold onto by the
          tub. Steady watches a short walkthrough, points out each risk, explains the fix and what it costs, and
          shows the fix in your own room.
        </p>
        <div className="mb-6 rounded-2xl bg-card p-4 ring-1 ring-line">
          <ResidentForm value={resident} onChange={setResident} />
          <p className="mt-3 text-xs text-muted">
            The same rug is a small issue for one person and urgent for someone with a walker.
          </p>
        </div>
        <ol className="space-y-2 text-muted">
          <li><span className="font-semibold text-ink">1.</span> Walk slowly through one room, 20 to 45 seconds.</li>
          <li><span className="font-semibold text-ink">2.</span> Show the floor, the walls, and anything you hold onto.</li>
          <li><span className="font-semibold text-ink">3.</span> Keep people out of the shot.</li>
        </ol>
      </section>

      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className={`rounded-3xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-sage bg-sage-soft" : "border-line bg-card"
        }`}
      >
        <input
          ref={input}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-3xl" aria-hidden>
          ▶
        </div>
        <p className="mb-1 text-lg font-semibold">{file ? file.name : "Drop a walkthrough video here"}</p>
        <p className="mb-6 text-sm text-muted">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "or record one on your phone"}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-full border border-line px-6 py-3 font-semibold hover:bg-paper"
            disabled={busy}
          >
            {file ? "Choose another" : "Choose or record video"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!file || busy}
            className="rounded-full bg-sage px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Preparing video…" : "Check this room"}
          </button>
        </div>
        <form onSubmit={submitYouTube} className="mt-8 border-t border-line pt-6 text-left">
          <label htmlFor="yt" className="mb-2 block text-sm font-semibold">
            Or paste a YouTube link to a home tour
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="yt"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-3"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={!ytUrl.trim() || busy}
              className="rounded-full bg-ink px-6 py-3 font-semibold text-white disabled:opacity-40"
            >
              Check video
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Public videos only. The first 5 minutes are checked. Before/after views need your own upload.
          </p>
        </form>
        {error && <p className="mt-4 text-urgent">{error}</p>}
      </section>
    </div>
  );
}
