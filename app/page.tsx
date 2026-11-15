"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Resident } from "@/lib/schema";
import { DEFAULT_RESIDENT, ResidentForm } from "@/components/ResidentForm";
import { CheckIcon, ImageIcon, XIcon } from "@/components/icons";
import { StairsIllustration } from "@/components/StairsIllustration";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { useReveal } from "@/hooks/useReveal";
import { Button, Panel, TextInput, buttonClass } from "@/components/ui";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
type Photo = { file: File; url: string; key: string };

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  // Thumbnails use object URLs: free them when photos are removed and when the page unmounts.
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  /** One video OR 1–10 photos (never both). Video handling is unchanged; photos are checked here and on the server. */
  function addFiles(list: File[]) {
    setPickError(null);
    if (list.length === 0) return;
    const videos = list.filter((f) => f.type.startsWith("video/"));
    const images = list.filter((f) => !f.type.startsWith("video/"));
    if (videos.length > 0 && (images.length > 0 || photos.length > 0)) {
      setPickError("Use either one video or photos, not both.");
      return;
    }
    if (videos.length > 1) {
      setPickError("Choose one video.");
      return;
    }
    if (videos.length === 1) {
      setFile(videos[0]);
      return;
    }
    if (file) {
      setPickError("Use either one video or photos, not both.");
      return;
    }
    const problems: string[] = [];
    const ok: File[] = [];
    for (const f of images) {
      if (/image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) problems.push("HEIC photos aren't supported. Please use JPG or PNG.");
      else if (!/^image\/(jpeg|png|webp)$/i.test(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name)) problems.push("Please use JPG, PNG or WebP photos.");
      else if (f.size > MAX_PHOTO_BYTES) problems.push(`“${f.name}” is over 15 MB.`);
      else ok.push(f);
    }
    const room = MAX_PHOTOS - photos.length;
    if (ok.length > room) problems.push(`Up to ${MAX_PHOTOS} photos. ${ok.length - room} weren't added.`);
    const added = ok.slice(0, Math.max(0, room)).map((f) => ({ file: f, url: URL.createObjectURL(f), key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}` }));
    if (added.length) setPhotos((p) => [...p, ...added]);
    if (problems.length) setPickError([...new Set(problems)].join(" "));
  }

  function removePhoto(key: string) {
    setPickError(null);
    setPhotos((p) => {
      const gone = p.find((x) => x.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.key !== key);
    });
  }

  const ready = !!file || photos.length > 0;
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
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      if (file) body.append("video", file);
      else photos.forEach((p) => body.append("photos", p.file));
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

          <Step n={3} title="Add a walkthrough video or photos" titleId="step-video">
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
                  addFiles(Array.from(e.dataTransfer.files ?? []));
                }}
                className={`flex flex-col items-center gap-4 rounded-lg border border-dashed p-6 text-center transition-colors duration-150 ${
                  dragging ? "border-primary bg-primary-soft" : ready ? "border-success bg-success-soft" : "border-line-strong bg-page"
                }`}
              >
                <input
                  ref={input}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []).slice(0, 1));
                    e.target.value = "";
                  }}
                />
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                {ready ? (
                  <span className="grid h-12 w-12 place-content-center rounded-full bg-success text-on-primary" aria-hidden>
                    <CheckIcon className="h-6 w-6" />
                  </span>
                ) : (
                  <StairsIllustration />
                )}
                <div>
                  <p className="font-semibold">
                    {file
                      ? file.name
                      : photos.length > 0
                        ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`
                        : "Drop a video or photos here"}
                  </p>
                  <p className="text-sm text-muted tabular-nums">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : "One video, or up to 10 photos — one or two per room."}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  {photos.length === 0 && (
                    <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
                      {file ? "Choose another video" : "Choose or record video"}
                    </Button>
                  )}
                  {!file && (
                    <Button
                      variant="secondary"
                      onClick={() => photoInput.current?.click()}
                      disabled={busy || photos.length >= MAX_PHOTOS}
                    >
                      <ImageIcon />
                      {photos.length > 0 ? "Add more photos" : "Add photos"}
                    </Button>
                  )}
                  {(file || photos.length > 0) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setFile(null);
                        photos.forEach((p) => URL.revokeObjectURL(p.url));
                        setPhotos([]);
                        setPickError(null);
                      }}
                      disabled={busy}
                    >
                      Start over
                    </Button>
                  )}
                </div>
              </div>

              {pickError && (
                <p className="rounded-md bg-urgent-soft px-3 py-2 text-sm font-medium text-urgent" role="alert">
                  {pickError}
                </p>
              )}

              {photos.length > 0 && (
                <div className="space-y-2">
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label={`${photos.length} photos added`}>
                    {photos.map((p, i) => (
                      <li key={p.key} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={`Photo ${i + 1}`}
                          className="aspect-square w-full rounded-md border border-line bg-line object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded-sm bg-ink/75 px-1 text-sm font-semibold text-white tabular-nums" aria-hidden>
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePhoto(p.key)}
                          disabled={busy}
                          aria-label={`Remove photo ${i + 1}`}
                          className="press absolute -right-2 -top-2 grid h-11 w-11 place-content-center rounded-full"
                        >
                          <span className="grid h-7 w-7 place-content-center rounded-full border border-line bg-surface text-ink shadow-float">
                            <XIcon className="h-4 w-4" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted">Tip: add close-ups of anything that looks worn, cracked, stained or loose.</p>
                </div>
              )}

              {!photos.length && (
                <p className="text-sm text-muted">Walk slowly. Show floors, stairs and anything you hold onto.</p>
              )}
            </div>
          </Step>
        </ol>

        <div className="mt-8 space-y-2 border-t border-line pt-6">
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className={buttonClass("primary", "lg", true)}
            aria-describedby={!ready ? "check-hint" : undefined}
          >
            {busy ? (photos.length ? "Preparing photos…" : "Preparing video…") : "Check this home"}
          </button>
          {!ready && (
            <p id="check-hint" className="text-sm text-muted">
              Add a video or photos to continue.
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
