"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Hazard, LocalHelp as LocalHelpT, Price, Report } from "@/lib/schema";
import { HazardTimeline } from "./HazardTimeline";
import { BeforeAfter } from "./BeforeAfter";
import { YouTubePlayer, type YouTubeHandle } from "./YouTubePlayer";
import { LocalHelp } from "./LocalHelp";
import { ProgramBlock, SimplePlan } from "./SimplePlan";
import { ShareButton } from "./ShareButton";
import { ListenCard } from "./ListenCard";
import { VideoControls } from "./VideoControls";
import { AlertIcon, CheckIcon, CircleIcon, ExternalIcon, InfoIcon, PlayIcon, ShieldCheckIcon, SpinnerIcon } from "./icons";
import {
  Button,
  ButtonLink,
  EmptyState,
  Panel,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  Tag,
  findingsHeadline,
  fmtMoney,
  fmtRange,
  fmtTime,
  plural,
  postJson,
  prefersReducedMotion,
} from "./ui";
import { searchLinks } from "@/lib/shopping";
import { bestProgram } from "@/lib/plan";
import { useReveal } from "@/hooks/useReveal";
import { DEFAULT_RESIDENT, ResidentForm, describeResident } from "./ResidentForm";
import type { Resident } from "@/lib/schema";

type Budget = { enabled: boolean; used: number; max: number; remaining: number };

const post = <T,>(url: string, body: unknown) => postJson<T>(url, body);
const roomName = (r: string) => {
  const t = r.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function ReportView({ id }: { id: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const yt = useRef<YouTubeHandle>(null);
  const [seenBefore, setSeenBefore] = useState(false);
  useEffect(() => {
    setSeenBefore(new URLSearchParams(window.location.search).get("seen") === "1");
  }, []);
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"analyzing" | "ready" | "error">("analyzing");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [pricing, setPricing] = useState<Record<string, boolean>>({});
  const [visualizing, setVisualizing] = useState<string | null>(null);
  const [vizError, setVizError] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);

  const [editingResident, setEditingResident] = useState(false);
  const [draftResident, setDraftResident] = useState<Resident>(DEFAULT_RESIDENT);

  const analyze = useCallback(async (force = false, resident?: Resident) => {
    setStatus("analyzing");
    setError(null);
    try {
      const r = await post<Report>("/api/analyze", resident ? { id, force, resident } : { id, force });
      setReport(r);
      setSelectedId((r.hazards.find((h) => h.confidence >= 0.75) ?? r.hazards[0])?.id ?? null);
      setTab("plan");
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check this video. Try again in a minute.");
      setStatus("error");
    }
  }, [id]);

  // React StrictMode runs effects twice in dev; without this guard every visit sent two paid
  // Gemini calls.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === id) return;
    started.current = id;
    fetch(`/api/analyze?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r: Report | null) => {
        if (r) setReport((cur) => cur ?? r);
      })
      .catch(() => {});
    analyze();
    fetch("/api/visualize").then((r) => r.json()).then(setBudget).catch(() => {});
  }, [analyze]);

  // Price every hazard, one at a time (keeps within rate limits).
  useEffect(() => {
    if (!report || status !== "ready") return;
    let cancelled = false;
    (async () => {
      const ordered = [...report.hazards].sort((a, b) => b.confidence - a.confidence);
      for (const h of ordered) {
        if (cancelled || report.prices[h.id]) continue;
        setPricing((p) => ({ ...p, [h.id]: true }));
        try {
          const price = await post<Price>("/api/price", { id, hazardId: h.id });
          if (!cancelled) setReport((r) => (r ? { ...r, prices: { ...r.prices, [h.id]: price } } : r));
        } catch {
          /* leave unpriced; the detail view offers a retry */
        } finally {
          setPricing((p) => ({ ...p, [h.id]: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.hazards, status, id]);

  const selected = report?.hazards.find((h) => h.id === selectedId) ?? null;
  const SURE = 0.75;
  const [tab, setTab] = useState<"plan" | "safety" | "condition">("plan");
  const ofKind = (k: "safety" | "condition") => report?.hazards.filter((h) => (h.kind ?? "safety") === k) ?? [];
  const inTab = tab === "plan" ? [] : ofKind(tab);
  const showPlan = tab === "plan" && status === "ready" && !!report;
  const detailsTop = useRef<HTMLDivElement>(null);
  const confident = inTab.filter((h) => h.confidence >= SURE);
  const unsure = inTab.filter((h) => h.confidence < SURE);
  const countSure = (k: "safety" | "condition") => ofKind(k).filter((h) => h.confidence >= SURE).length;
  const [showUnsure, setShowUnsure] = useState(false);

  const totals = useMemo(() => {
    if (!report) return null;
    const prices = report.hazards.map((h) => report.prices[h.id]).filter(Boolean) as Price[];
    return {
      urgent: report.hazards.filter((h) => (h.kind ?? "safety") === "safety" && h.priority === "urgent" && h.confidence >= 0.75).length,
      sure: report.hazards.filter((h) => (h.kind ?? "safety") === "safety" && h.confidence >= 0.75).length,
      condition: report.hazards.filter((h) => h.kind === "condition" && h.confidence >= 0.75).length,
      low: prices.reduce((s, p) => s + p.cost_low_usd, 0),
      high: prices.reduce((s, p) => s + p.cost_high_usd, 0),
      priced: prices.length,
    };
  }, [report]);

  function select(h: Hazard) {
    setSelectedId(h.id);
    setVizError(null);
    if (report?.source.type === "youtube") {
      yt.current?.seekTo(h.timestamp_s);
    } else if (video.current) {
      video.current.currentTime = h.timestamp_s;
      video.current.pause();
    }
  }

  /** "More info" from the Simple plan: open the finding's tab and jump to it in the video. */
  function moreInfo(h: Hazard) {
    setTab(h.kind ?? "safety");
    select(h);
    requestAnimationFrame(() =>
      detailsTop.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }),
    );
  }

  const resetLocation = (loc: string) =>
    setReport((r) => (r ? { ...r, location: loc, location_geo: null, location_area: null, local: {}, funding: null } : r));

  async function visualize(h: Hazard) {
    setVisualizing(h.id);
    setVizError(null);
    try {
      const res = await post<{ clip: string }>("/api/visualize", { id, hazardId: h.id });
      setReport((r) => (r ? { ...r, clips: { ...r.clips, [h.id]: res.clip } } : r));
      fetch("/api/visualize").then((r) => r.json()).then(setBudget).catch(() => {});
    } catch (e) {
      setVizError(e instanceof Error ? e.message : "Couldn't make the before/after view.");
    } finally {
      setVisualizing(null);
    }
  }

  async function retryPrice(h: Hazard) {
    setPricing((p) => ({ ...p, [h.id]: true }));
    try {
      const price = await post<Price>("/api/price", { id, hazardId: h.id });
      setReport((r) => (r ? { ...r, prices: { ...r.prices, [h.id]: price } } : r));
    } catch {
      /* noop */
    } finally {
      setPricing((p) => ({ ...p, [h.id]: false }));
    }
  }

  // ---- Tabs: sliding indicator (transform only) ----
  // The bar matches the label text (not the padded button), so we measure an inner span.
  const tabRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab];
      // offsetLeft is relative to the tablist (the nearest positioned ancestor).
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab, status, report?.hazards.length]);

  const reveal = useReveal<HTMLDivElement>([tab, status, selectedId, report?.hazards.length]);
  const sureHazards = report?.hazards.filter((h) => h.confidence >= SURE) ?? [];

  return (
    <div className="space-y-6" ref={reveal}>
      {seenBefore && (
        <Panel tone="info" padding="none" className="flex items-start gap-3 px-4 py-3">
          <InfoIcon className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <p>You&apos;ve checked this video before, so this is the saved report.</p>
        </Panel>
      )}

      <SummaryHeader
        status={status}
        report={report}
        sureHazards={sureHazards}
        totals={totals}
        editing={editingResident}
        onEdit={() => {
          setDraftResident(report?.resident ?? DEFAULT_RESIDENT);
          setEditingResident(true);
        }}
        onRerun={() => analyze(true)}
      >
        {editingResident && (
          <div className="enter space-y-6 border-t border-line pt-6">
            <ResidentForm value={draftResident} onChange={setDraftResident} />
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setEditingResident(false);
                  setReport((r) => (r ? { ...r, resident: draftResident, hazards: [], prices: {}, clips: {} } : r));
                  analyze(true, draftResident);
                }}
              >
                Re-check for this person
              </Button>
              <Button variant="secondary" onClick={() => setEditingResident(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SummaryHeader>

      {status === "error" && (
        <div className="enter flex flex-wrap items-center gap-4 rounded-lg border border-urgent/25 bg-urgent-soft p-4" role="alert">
          <AlertIcon className="h-5 w-5 shrink-0 text-urgent" />
          <p className="flex-1 font-medium text-urgent">{error}</p>
          <Button variant="secondary" onClick={() => analyze()}>
            Try again
          </Button>
        </div>
      )}

      {report && status !== "analyzing" && (
        // px-1/pt-1 leave room for the focus ring inside the scroll container so it isn't clipped.
        <div
          ref={detailsTop}
          className="relative flex scroll-mt-4 gap-1 overflow-x-auto border-b border-line px-1 pt-1"
          role="tablist"
          aria-label="Report views"
        >
          {(["plan", "safety", "condition"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              onClick={() => {
                setTab(k);
                if (k === "plan") return;
                const first = ofKind(k).sort((a, b) => b.confidence - a.confidence)[0];
                if (first) select(first);
              }}
              // Keyboard focus only: 3px primary ring at 35%, 6px radius, no 1px border and no mouse-click outline.
              className={`mb-1 min-h-11 shrink-0 rounded-[6px] px-3 text-base font-semibold transition-colors focus-visible:shadow-[0_0_0_3px_rgb(42_91_215/0.35)] sm:px-4 sm:text-lg ${
                tab === k ? "text-primary" : "text-muted hover:bg-primary-soft hover:text-ink"
              }`}
            >
              <span
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
              >
              {k === "plan" ? (
                "Plan"
              ) : k === "safety" ? (
                "Safety"
              ) : (
                <>
                  <span className="sm:hidden">Condition</span>
                  <span className="hidden sm:inline">Home condition</span>
                </>
              )}
              {k !== "plan" && <span className="font-normal tabular-nums"> ({countSure(k)})</span>}
              </span>
            </button>
          ))}
          {bar && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-primary transition-transform duration-[var(--dur)] ease-[var(--ease-out)]"
              style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
            />
          )}
        </div>
      )}

      {showPlan && report && (
        <div key="plan" id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" className="enter-tab">
          <SimplePlan
            report={report}
            pricing={pricing}
            actions={<ShareButton reportId={id} />}
            top={<ListenCard reportId={id} />}
            onMoreInfo={moreInfo}
            onLocationSaved={resetLocation}
            onFunding={(funding) => setReport((r) => (r ? { ...r, funding } : r))}
            onLocal={(help) => setReport((r) => (r ? { ...r, local: { ...r.local, [help.hazard_id]: help } } : r))}
          />
        </div>
      )}

      {/* Kept mounted (just hidden) on the plan tab so "More info" can seek the player immediately. */}
      {/* Not keyed by tab: remounting would reset the <video>. The list and detail cross-fade instead. */}
      <div
        id={tab === "plan" ? undefined : `panel-${tab}`}
        role={showPlan ? undefined : "tabpanel"}
        aria-labelledby={showPlan ? undefined : `tab-${tab}`}
        className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]"
        hidden={showPlan}
        // Mobile order (= DOM and keyboard order): video, findings list, selected finding's detail.
        // Desktop: the video stays put on the left; the list and the detail stack in the right column.
      >
          <Panel
            as="section"
            aria-label="Video"
            className="min-w-0 lg:sticky lg:top-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start"
          >
            {report?.source.type === "youtube" ? (
              <YouTubePlayer ref={yt} videoId={report.source.videoId} onDuration={setDuration} onTime={setCurrent} />
            ) : report ? (
              <video
                ref={video}
                src={`/api/video/${id}`}
                playsInline
                onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play().catch(() => {}) : e.currentTarget.pause())}
                className="aspect-video w-full cursor-pointer rounded-md bg-ink"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || report?.duration_s || 0)}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              />
            ) : (
              <div className="aspect-video w-full rounded-md bg-line" aria-hidden />
            )}
            {report && report.source.type !== "youtube" && <VideoControls video={video} />}
            {report && (
              <HazardTimeline
                hazards={inTab}
                duration={duration || report.duration_s || 0}
                current={current}
                selectedId={selectedId}
                onSelect={select}
                onSeek={(t) => {
                  if (report.source.type === "youtube") yt.current?.seekTo(t);
                  else if (video.current) video.current.currentTime = t;
                  setCurrent(t);
                }}
              />
            )}
          </Panel>

        <aside key={`list-${tab}`} className="enter-tab min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
          {status === "analyzing" ? (
            <LoadingSteps youtube={report?.source.type === "youtube"} />
          ) : status === "error" ? null : report && report.hazards.length === 0 ? (
            <EmptyState icon={<ShieldCheckIcon />} action={<ButtonLink href="/" variant="secondary">Check another video</ButtonLink>}>
              No clear hazards in this video.
            </EmptyState>
          ) : (
            <Panel padding="none">
              <h2 className="border-b border-line px-4 py-4 text-xl sm:px-6">{findingsHeadline(confident)}</h2>
              {report && confident.length > 0 && (
                <ul className="divide-y divide-line">
                  {confident.map((h, i) => (
                    <li key={h.id} data-reveal-item data-reveal-index={i}>
                      <FindingRow
                        hazard={h}
                        reportId={id}
                        isYouTube={report.source.type === "youtube"}
                        price={report.prices[h.id]}
                        pricing={!!pricing[h.id]}
                        selected={h.id === selectedId}
                        onClick={() => select(h)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {report && unsure.length > 0 && (
                <div className="border-t border-line px-2 py-2 sm:px-4">
                  <Button variant="ghost" onClick={() => setShowUnsure((v) => !v)} aria-expanded={showUnsure}>
                    {showUnsure ? "Hide" : "Show"} {unsure.length} less certain
                  </Button>
                  {showUnsure && (
                    <ul className="enter divide-y divide-line">
                      {unsure.map((h) => (
                        <li key={h.id}>
                          <FindingRow
                            hazard={h}
                            reportId={id}
                            isYouTube={report.source.type === "youtube"}
                            price={report.prices[h.id]}
                            pricing={!!pricing[h.id]}
                            selected={h.id === selectedId}
                            onClick={() => select(h)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Panel>
          )}
        </aside>

          <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-2">

            {selected && status === "ready" && report && (
              <div key={selected.id} className="enter space-y-6">
                <HazardDetail
                  hazard={selected}
                  report={report}
                  price={report.prices[selected.id]}
                  pricing={!!pricing[selected.id]}
                  clip={report.clips[selected.id]}
                  visualizing={visualizing === selected.id}
                  vizError={vizError}
                  budget={budget}
                  isYouTube={report.source.type === "youtube"}
                  reportId={id}
                  location={report.location ?? null}
                  local={report.local?.[selected.id]}
                  onLocation={resetLocation}
                  onLocalLoaded={(help) => setReport((r) => (r ? { ...r, local: { ...r.local, [help.hazard_id]: help } } : r))}
                  onVisualize={() => visualize(selected)}
                  onRetryPrice={() => retryPrice(selected)}
                />
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function SummaryHeader(props: {
  status: string;
  report: Report | null;
  sureHazards: Hazard[];
  totals: { urgent: number; sure: number; condition: number; low: number; high: number; priced: number } | null;
  editing: boolean;
  onEdit: () => void;
  onRerun: () => void;
  children?: React.ReactNode;
}) {
  const { status, report, totals, sureHazards } = props;
  const [showRooms, setShowRooms] = useState(false);
  const rooms = report?.rooms_covered.map(roomName).filter(Boolean) ?? [];
  return (
    <Panel as="section" aria-label="Summary" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-primary">Home check</p>
          <h1 className="text-2xl sm:text-3xl">
            {status === "analyzing"
              ? "Checking your walkthrough"
              : status === "error"
                ? "Couldn't check this video"
                : findingsHeadline(sureHazards)}
          </h1>
          {status === "ready" && rooms.length > 0 && (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-x-2 text-muted">
                <span className="tabular-nums">{plural(rooms.length, "room")} checked</span>
                <Button
                  variant="ghost"
                  className="-ml-1 min-h-11"
                  aria-expanded={showRooms}
                  aria-controls="rooms-list"
                  onClick={() => setShowRooms((v) => !v)}
                >
                  {showRooms ? "Hide rooms" : "Show rooms"}
                </Button>
              </p>
              {showRooms && (
                <ul id="rooms-list" className="enter flex flex-wrap gap-2" aria-label="Rooms checked">
                  {rooms.map((r, i) => (
                    <li key={`${r}-${i}`}>
                      <Tag tone="neutral">{r}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {totals && totals.priced > 0 && status === "ready" && (
          <div>
            <p className="text-sm text-muted">Estimated total{totals.priced < (report?.hazards.length ?? 0) ? " so far" : ""}</p>
            <p className="text-2xl font-bold tabular-nums">
              {fmtRange(totals.low, totals.high)}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4">
        <p>
          <span className="text-muted">Checked for: </span>
          <span className="font-semibold">{describeResident(report?.resident)}</span>
        </p>
        {!props.editing && (
          <div className="-mx-2 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={props.onEdit} disabled={status === "analyzing"}>
              Change who lives here
            </Button>
            {status === "ready" && (
              <Button variant="ghost" onClick={props.onRerun}>
                Check again
              </Button>
            )}
          </div>
        )}
      </div>
      {props.children}
    </Panel>
  );
}

const STEPS = ["Watching the video", "Double-checking each finding", "Confirming in video frames"];
// Typical timings for an upload. The server doesn't stream progress, so steps advance on these timers and the
// last step only finishes when the result arrives.
const STEP_AT_MS = [0, 12_000, 24_000];

function LoadingSteps({ youtube }: { youtube?: boolean }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const timers = STEP_AT_MS.slice(1).map((ms, i) => setTimeout(() => setCurrent(i + 1), youtube ? ms * 2 : ms));
    return () => timers.forEach(clearTimeout);
  }, [youtube]);
  return (
    <Panel className="space-y-4" role="status" aria-live="polite">
      <p className="text-lg font-semibold">Checking… {youtube ? "up to 2 minutes" : "usually under a minute"}</p>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 ${i > current ? "text-muted" : ""}`}>
            {i < current ? (
              <span key="done" className="enter grid h-5 w-5 place-content-center rounded-full bg-success text-on-primary">
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
            ) : i === current ? (
              <SpinnerIcon className="h-5 w-5 text-primary" />
            ) : (
              <CircleIcon className="h-5 w-5 text-line-strong" />
            )}
            {s}
            {i < current && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">Findings that can&apos;t be confirmed are removed.</p>
    </Panel>
  );
}

function Thumb({ reportId, hazard: h, isYouTube }: { reportId: string; hazard: Hazard; isYouTube: boolean }) {
  if (isYouTube) {
    return (
      <span className="grid h-[72px] w-24 shrink-0 place-content-center rounded-md bg-nice-soft text-muted" aria-hidden>
        <PlayIcon />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/frame/${reportId}?t=${h.timestamp_s}`}
      alt={h.title}
      width={96}
      height={72}
      loading="lazy"
      decoding="async"
      className="h-[72px] w-24 shrink-0 rounded-md bg-line object-cover"
    />
  );
}

function FindingRow(props: {
  hazard: Hazard;
  reportId: string;
  isYouTube: boolean;
  price?: Price;
  pricing: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const { hazard: h, price, pricing, selected } = props;
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={selected ? "true" : undefined}
      className={`press flex w-full items-start gap-4 border-l-[3px] px-4 py-4 text-left transition-colors sm:px-6 ${
        selected ? "border-primary bg-primary-soft" : "border-transparent hover:bg-primary-soft/60"
      }`}
    >
      <Thumb reportId={props.reportId} hazard={h} isYouTube={props.isYouTube} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-semibold leading-snug">{h.title}</span>
        <span className="block text-sm text-muted tabular-nums">
          {roomName(h.room)} · {fmtTime(h.timestamp_s)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Tag tone={PRIORITY_TONE[h.priority]}>{PRIORITY_LABEL[h.priority]}</Tag>
          <span className="text-sm text-muted tabular-nums">
            {price ? fmtRange(price.cost_low_usd, price.cost_high_usd) : pricing ? "Checking prices…" : ""}
          </span>
        </span>
      </span>
    </button>
  );
}

function HazardDetail(props: {
  hazard: Hazard;
  report: Report;
  price?: Price;
  pricing: boolean;
  clip?: string;
  visualizing: boolean;
  vizError: string | null;
  budget: Budget | null;
  isYouTube: boolean;
  reportId: string;
  location: string | null;
  local?: LocalHelpT;
  onLocation: (loc: string) => void;
  onLocalLoaded: (help: LocalHelpT) => void;
  onVisualize: () => void;
  onRetryPrice: () => void;
}) {
  const { hazard: h, price, clip, budget, report } = props;
  const frameUrl = props.isYouTube ? null : `/api/frame/${props.reportId}?t=${h.timestamp_s}`;
  const program = bestProgram(report.funding, h.id);
  return (
    <>
      <Panel as="article" padding="none" aria-labelledby="finding-title" data-reveal-item className="overflow-hidden">
        {frameUrl ? (
          <div className="relative aspect-video w-full bg-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frameUrl} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div className="frame-overlay frame-overlay-tall absolute inset-0" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white sm:p-6">
              <p className="text-sm font-semibold tabular-nums">
                {roomName(h.room)} · {fmtTime(h.timestamp_s)}
              </p>
              <h2 id="finding-title" className="text-xl text-white sm:text-2xl">
                {h.title}
              </h2>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-6 sm:px-6">
            <p className="text-sm font-semibold text-muted tabular-nums">
              {roomName(h.room)} · {fmtTime(h.timestamp_s)}
            </p>
            <h2 id="finding-title" className="text-2xl">
              {h.title}
            </h2>
          </div>
        )}
        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={PRIORITY_TONE[h.priority]}>{PRIORITY_LABEL[h.priority]}</Tag>
            {h.verified === true && (
              <Tag tone="success">
                <CheckIcon className="h-4 w-4" />
                Confirmed in the video
              </Tag>
            )}
            {h.verified === false && <Tag tone="nice">Not double-checked</Tag>}
            {h.confidence < 0.75 && <Tag tone="nice">Less certain</Tag>}
          </div>
          <dl className="divide-y divide-line">
            {h.evidence && <DetailRow term="What we saw">{h.evidence}</DetailRow>}
            <DetailRow term="Why it matters">{h.why_it_matters}</DetailRow>
            {h.personal_note && <DetailRow term="For them">{h.personal_note}</DetailRow>}
            <DetailRow term="Fix">
              <p className="font-medium">{h.fix}</p>
              <p className="text-sm text-muted">{h.diy_or_pro === "pro" ? "Hire a professional." : "Do it yourself."}</p>
              {h.needs_measurement && (
                <p className="text-sm">
                  <span className="font-semibold">Measure first: </span>
                  {h.needs_measurement}
                </p>
              )}
            </DetailRow>
            <DetailRow term="Cost">
              {price ? (
                <>
                  <p className="text-xl font-bold tabular-nums">
                    {fmtRange(price.cost_low_usd, price.cost_high_usd)}
                  </p>
                  <p className="text-sm text-muted">
                    {price.includes_installation ? "With installation." : "Materials only."} {price.note}
                  </p>
                  {price.sources.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {price.sources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-primary underline hover:text-primary-hover">
                            {s.title}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : props.pricing ? (
                <p className="text-muted">Checking prices…</p>
              ) : (
                <Button variant="ghost" onClick={props.onRetryPrice} className="-ml-2">
                  Get a price
                </Button>
              )}
            </DetailRow>
          </dl>
        </div>
      </Panel>

      <WhereToBuy hazard={h} price={price} />

      <LocalHelp
        reportId={props.reportId}
        hazard={h}
        location={props.location}
        cached={props.local}
        onLocation={props.onLocation}
        onLoaded={props.onLocalLoaded}
      />

      <Panel as="section" aria-labelledby="help-paying-title" data-reveal-item className="space-y-3">
        <h3 id="help-paying-title" className="text-xl">
          Help paying
        </h3>
        {program ? (
          <ProgramBlock program={program} bare />
        ) : report.funding ? (
          <p>Ask your local Area Agency on Aging about help with this.</p>
        ) : report.location ? (
          <p className="text-muted">Programs load on the Plan tab.</p>
        ) : (
          <p className="text-muted">Add a ZIP code on the Plan tab to see programs near you.</p>
        )}
      </Panel>

    </>
  );
}

function DetailRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted">{term}</dt>
      <dd className="space-y-1">{children}</dd>
    </div>
  );
}

function WhereToBuy({ hazard: h, price }: { hazard: Hazard; price?: Price }) {
  const query = price?.search_query || h.title;
  const links = searchLinks(query);
  return (
    <Panel as="section" aria-labelledby="buy-title" data-reveal-item className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="buy-title" className="text-xl">
          Where to buy
        </h3>
        {h.diy_or_pro === "pro" && <p className="text-sm text-muted">Buy the part, then have a pro install it.</p>}
      </div>
      {price && price.products.length > 0 ? (
        <ul className="divide-y divide-line">
          {price.products.map((p) => (
            <li key={p.url} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary underline hover:text-primary-hover">
                  {p.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="text-sm text-muted">{p.retailer}</span>
              </div>
              {typeof p.price_usd === "number" && (
                <span className="shrink-0 font-semibold tabular-nums">{fmtMoney(Math.round(p.price_usd))}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{price ? "No specific products confirmed." : "Finding products…"}</p>
      )}
      <div className="-ml-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className="ml-2 mr-1 text-sm text-muted">Search “{query}” at</span>
        {links.map((l) => (
          <ButtonLink key={l.retailer} href={l.url} external variant="ghost" className="font-medium">
            {l.retailer}
            <ExternalIcon className="h-4 w-4" />
          </ButtonLink>
        ))}
      </div>
    </Panel>
  );
}
