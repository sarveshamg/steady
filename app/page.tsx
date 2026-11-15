"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Resident } from "@/lib/schema";
import { DEFAULT_RESIDENT, ResidentForm } from "@/components/ResidentForm";
import { CheckIcon } from "@/components/icons";
import { StairsIllustration } from "@/components/StairsIllustration";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { useReveal } from "@/hooks/useReveal";
import { Button, Panel, TextInput, buttonClass } from "@/components/ui";

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resident, setResident] = useState<Resident>(DEFAULT_RESIDENT);
  const [location, setLocation] = useState("");

  // Below-the-fold reveal for the form header and panel (60ms stagger). Hidden state is set only after mount.
  const startRef = useReveal<HTMLDivElement>([], { stagger: 60 });

  async function readError(res: Response, fallback: string) {
    try {
      const json = await res.json();
      return typeof json.error === "string" ? json.error : fallback;
    } catch {
      return fallback;
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
      if (location.trim()) body.append("location", location.trim());
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) throw new Error(await readError(res, "The upload didn't work. Try again."));
      const json = await res.json();
      router.push(`/report/${json.id}${json.duplicate ? "?seen=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload didn't work. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-16 sm:space-y-24">
      <Hero />
      <HowItWorks />

      <div id="start" ref={startRef} className="mx-auto max-w-[640px] scroll-mt-6 space-y-8">
      <div className="space-y-2" data-reveal-item>
        <h2 className="text-2xl">Check a home</h2>
        <p className="text-lg text-muted">Three quick steps. It usually takes under a minute.</p>
      </div>

      <Panel padding="lg" data-reveal-item>
        <ol className="space-y-8">
          <Step n={1} title="Who lives here" titleId="step-who">
            <ResidentForm value={resident} onChange={setResident} hideLegend />
          </Step>

          <Step n={2} title="ZIP code" titleId="step-zip" optional>
            <div className="space-y-2">
              <label htmlFor="location" className="sr-only">
                ZIP code
              </label>
              <TextInput
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                autoComplete="postal-code"
                placeholder="95064"
                className="max-w-xs"
                aria-describedby="location-hint"
              />
              <p id="location-hint" className="text-sm text-muted">
                Used only to find local help.
              </p>
            </div>
          </Step>

          <Step n={3} title="Add a walkthrough video" titleId="step-video">
            <div className="space-y-2">
              <div
                role="group"
                aria-labelledby="step-video"
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
                className={`flex flex-col items-center gap-4 rounded-lg border border-dashed p-6 text-center transition-colors duration-150 ${
                  dragging ? "border-primary bg-primary-soft" : file ? "border-success bg-success-soft" : "border-line-strong bg-page"
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
                {file ? (
                  <span className="grid h-12 w-12 place-content-center rounded-full bg-success text-on-primary" aria-hidden>
                    <CheckIcon className="h-6 w-6" />
                  </span>
                ) : (
                  <StairsIllustration />
                )}
                <div>
                  <p className="font-semibold">{file ? file.name : "Drop a video here, or record one on your phone"}</p>
                  <p className="text-sm text-muted tabular-nums">
                    {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Under a minute. Keep people out of the shot."}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
                  {file ? "Choose another" : "Choose or record"}
                </Button>
              </div>
              <p className="text-sm text-muted">Walk slowly. Show floors, stairs and anything you hold onto.</p>
            </div>
          </Step>
        </ol>

        <div className="mt-8 space-y-2 border-t border-line pt-6">
          <button
            type="button"
            onClick={submit}
            disabled={!file || busy}
            className={buttonClass("primary", "lg", true)}
            aria-describedby={!file ? "check-hint" : undefined}
          >
            {busy ? "Preparing video…" : "Check this home"}
          </button>
          {!file && (
            <p id="check-hint" className="text-sm text-muted">
              Add a video to continue.
            </p>
          )}
          {error && (
            <p className="rounded-md bg-urgent-soft px-3 py-2 font-medium text-urgent" role="alert">
              {error}
            </p>
          )}
        </div>
      </Panel>

      </div>
    </div>
  );
}

function Step(props: { n: number; title: string; titleId: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4" aria-labelledby={props.titleId}>
      <span
        className="grid h-8 w-8 shrink-0 place-content-center rounded-full bg-primary-soft font-semibold text-primary tabular-nums"
        aria-hidden
      >
        {props.n}
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        <h2 id={props.titleId} className="pt-1 text-xl">
          {props.title}
          {props.optional && <span className="font-normal text-muted"> (optional)</span>}
        </h2>
        {props.children}
      </div>
    </li>
  );
}
