"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hazard, Price, Report } from "@/lib/schema";
import { HazardTimeline } from "./HazardTimeline";
import { BeforeAfter } from "./BeforeAfter";
import { YouTubePlayer, type YouTubeHandle } from "./YouTubePlayer";
import { LocalHelp } from "./LocalHelp";
import { SimplePlan } from "./SimplePlan";
import { ShareButton } from "./ShareButton";
import { ListenCard } from "./ListenCard";
import { PRIORITY_LABEL, PRIORITY_STYLE, fmtMoney, fmtTime } from "./ui";
import { searchLinks } from "@/lib/shopping";
import { DEFAULT_RESIDENT, ResidentForm, describeResident } from "./ResidentForm";
import type { Resident } from "@/lib/schema";

type Budget = { enabled: boolean; used: number; max: number; remaining: number };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}

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
      setError(e instanceof Error ? e.message : "Analysis failed");
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
          /* leave unpriced; the card shows a retry */
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
    requestAnimationFrame(() => detailsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      setVizError(e instanceof Error ? e.message : "Could not create the visualization");
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

  return (
    <div className="space-y-6">
      {seenBefore && (
        <div className="rounded-2xl bg-nice-soft px-4 py-3 text-sm text-ink">
          You&apos;ve checked this video before, so this is the saved report. To check it for someone else, use
          “Change who lives here”.
        </div>
      )}
      <SummaryBar status={status} report={report} totals={totals} onRerun={() => analyze(true)} />
      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        {editingResident ? (
          <div className="space-y-4">
            <ResidentForm value={draftResident} onChange={setDraftResident} />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingResident(false);
                  setReport((r) => (r ? { ...r, resident: draftResident, hazards: [], prices: {}, clips: {} } : r));
                  analyze(true, draftResident);
                }}
                className="rounded-full bg-sage px-5 py-2 font-semibold text-white"
              >
                Re-check for this person
              </button>
              <button onClick={() => setEditingResident(false)} className="rounded-full px-4 py-2 text-muted underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="text-sm font-semibold text-muted">Checked for: </span>
              <span className="font-medium">{describeResident(report?.resident)}</span>
            </p>
            <button
              onClick={() => {
                setDraftResident(report?.resident ?? DEFAULT_RESIDENT);
                setEditingResident(true);
              }}
              className="text-sm text-sage underline"
              disabled={status === "analyzing"}
            >
              Change who lives here
            </button>
          </div>
        )}
      </div>

      {status === "error" && (
        <div className="rounded-2xl border border-urgent/30 bg-urgent-soft p-4 text-urgent">
          {error} <button className="ml-2 underline" onClick={() => analyze()}>Try again</button>
        </div>
      )}

      {report && status !== "analyzing" && (
        <div ref={detailsTop} className="flex flex-wrap gap-3 scroll-mt-4" role="tablist" aria-label="Report views">
          {(["plan", "safety", "condition"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                if (k === "plan") return;
                const first = ofKind(k).sort((a, b) => b.confidence - a.confidence)[0];
                if (first) select(first);
              }}
              className={`min-h-12 rounded-full px-5 text-lg font-semibold ${
                tab === k ? "bg-ink text-white" : "bg-card ring-1 ring-line hover:ring-ink/30"
              }`}
            >
              {k === "plan" ? "Simple plan" : k === "safety" ? "Safety" : "Home condition"}
              {k !== "plan" && ` (${countSure(k)})`}
            </button>
          ))}
        </div>
      )}

      {showPlan && report && (
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
      )}

      {/* Kept mounted (just hidden) on the plan tab so "More info" can seek the player immediately. */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" hidden={showPlan}>
        <section className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
          {report?.source.type === "youtube" ? (
            <YouTubePlayer ref={yt} videoId={report.source.videoId} onDuration={setDuration} onTime={setCurrent} />
          ) : report ? (
            <video
              ref={video}
              src={`/api/video/${id}`}
              controls
              playsInline
              className="aspect-video w-full rounded-2xl bg-ink"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || report?.duration_s || 0)}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            />
          ) : (
            <div className="aspect-video w-full animate-pulse rounded-2xl bg-ink/80" />
          )}
          {report && (
            <HazardTimeline
              hazards={inTab}
              duration={duration || report.duration_s || 0}
              current={current}
              selectedId={selectedId}
              onSelect={select}
            />
          )}
          {selected && (
            <HazardDetail
              hazard={selected}
              price={report?.prices[selected.id]}
              pricing={!!pricing[selected.id]}
              clip={report?.clips[selected.id]}
              visualizing={visualizing === selected.id}
              vizError={vizError}
              budget={budget}
              isYouTube={report?.source.type === "youtube"}
              reportId={id}
              location={report?.location ?? null}
              local={report?.local?.[selected.id]}
              onLocation={resetLocation}
              onLocalLoaded={(help) =>
                setReport((r) => (r ? { ...r, local: { ...r.local, [help.hazard_id]: help } } : r))
              }
              onVisualize={() => visualize(selected)}
              onRetryPrice={() => retryPrice(selected)}
            />
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="text-lg font-semibold">
            {status === "analyzing"
              ? "Looking for hazards…"
              : status === "error"
                ? "No results yet"
                : confident.length === 0
                  ? tab === "safety"
                    ? "No clear safety hazards"
                    : "No clear condition problems"
                  : `${confident.length} ${confident.length === 1 ? "thing" : "things"} to look at`}
          </h2>
          {status === "analyzing" && <SkeletonList />}
          {report &&
            confident.map((h) => (
              <HazardRow
                key={h.id}
                hazard={h}
                price={report.prices[h.id]}
                pricing={!!pricing[h.id]}
                selected={h.id === selectedId}
                onClick={() => select(h)}
              />
            ))}
          {report && unsure.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowUnsure((v) => !v)} className="text-sm text-muted underline">
                {showUnsure ? "Hide" : "Show"} {unsure.length} {unsure.length === 1 ? "thing" : "things"} worth a second
                look
              </button>
              {showUnsure && (
                <div className="mt-3 space-y-3 opacity-80">
                  {unsure.map((h) => (
                    <HazardRow
                      key={h.id}
                      hazard={h}
                      price={report.prices[h.id]}
                      pricing={!!pricing[h.id]}
                      selected={h.id === selectedId}
                      onClick={() => select(h)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {status === "ready" && report?.hazards.length === 0 && (
            <p className="rounded-2xl bg-sage-soft p-4">
              No hazards found in this clip. Try filming the bathroom, stairs, or the path to the bedroom at night.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function SummaryBar(props: {
  status: string;
  report: Report | null;
  totals: { urgent: number; sure: number; condition: number; low: number; high: number; priced: number } | null;
  onRerun: () => void;
}) {
  const { status, report, totals } = props;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-sage">Home check</p>
        <h1 className="text-3xl font-bold">
          {status === "analyzing"
            ? "Watching your walkthrough…"
            : status === "error"
              ? "Couldn't check this walkthrough"
              : report && (totals?.sure ?? 0) > 0
                ? `${totals!.sure} ${totals!.sure === 1 ? "hazard" : "hazards"}${
                    totals!.urgent > 0 ? `, ${totals!.urgent} to fix now` : ", none urgent"
                  }`
                : report && report.hazards.length > 0
                  ? "No clear safety hazards"
                  : "No clear hazards found"}
        </h1>
        {status === "analyzing" && (
          <p className="text-muted">
            {report?.source.type === "youtube"
              ? "YouTube tours can take up to 2 minutes."
              : "This usually takes under a minute."}
          </p>
        )}
        {report && report.rooms_covered.length > 0 && (
          <p className="text-muted">Rooms seen: {report.rooms_covered.map((r) => r.replace(/[_-]+/g, " ")).join(", ")}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {totals && totals.priced > 0 && (
          <div className="rounded-2xl bg-card px-4 py-2 text-right ring-1 ring-line">
            <p className="text-xs text-muted">Estimated total{totals.priced < (report?.hazards.length ?? 0) ? " so far" : ""}</p>
            <p className="text-xl font-bold">
              {fmtMoney(totals.low)}–{fmtMoney(totals.high)}
            </p>
          </div>
        )}
        {status !== "analyzing" && (
          <button onClick={props.onRerun} className="text-sm text-muted underline">
            Re-run analysis
          </button>
        )}
      </div>
    </div>
  );
}

function HazardRow(props: { hazard: Hazard; price?: Price; pricing: boolean; selected: boolean; onClick: () => void }) {
  const { hazard: h, price, pricing, selected } = props;
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`w-full rounded-2xl bg-card p-4 text-left ring-1 transition ${
        selected ? "ring-2 ring-sage" : "ring-line hover:ring-ink/30"
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY_STYLE[h.priority].chip}`}>
          {PRIORITY_LABEL[h.priority]}
        </span>
        <span className="text-muted">
          {h.room.replace(/[_-]+/g, " ")} · {fmtTime(h.timestamp_s)}
        </span>
        {h.personal_note && <span className="font-semibold text-soon">· matters for them</span>}
      </div>
      <p className="font-semibold">{h.title}</p>
      <p className="text-sm text-muted">
        {price
          ? `${fmtMoney(price.cost_low_usd)}–${fmtMoney(price.cost_high_usd)} · ${h.diy_or_pro === "pro" ? "Hire a pro" : "Do it yourself"}`
          : pricing
            ? "Checking prices…"
            : h.diy_or_pro === "pro" ? "Hire a pro" : "Do it yourself"}
      </p>
    </button>
  );
}

function HazardDetail(props: {
  hazard: Hazard;
  price?: Price;
  pricing: boolean;
  clip?: string;
  visualizing: boolean;
  vizError: string | null;
  budget: Budget | null;
  isYouTube: boolean;
  reportId: string;
  location: string | null;
  local?: import("@/lib/schema").LocalHelp;
  onLocation: (loc: string) => void;
  onLocalLoaded: (help: import("@/lib/schema").LocalHelp) => void;
  onVisualize: () => void;
  onRetryPrice: () => void;
}) {
  const { hazard: h, price, clip, budget } = props;
  const frameUrl = props.isYouTube ? null : `/api/frame/${props.reportId}?t=${h.timestamp_s}`;
  return (
    <div className="mt-5 space-y-4 border-t border-line pt-5">
      <div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[h.priority].chip}`}>
          {PRIORITY_LABEL[h.priority]}
        </span>
        <h2 className="mt-2 text-2xl font-bold">{h.title}</h2>
        {h.evidence && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
            {frameUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frameUrl}
                alt={`Video frame at ${fmtTime(h.timestamp_s)}: ${h.evidence}`}
                className="w-full rounded-xl ring-1 ring-line sm:w-56"
              />
            )}
            <p className="text-sm">
              <span className="font-semibold">What we saw{frameUrl ? ` at ${fmtTime(h.timestamp_s)}` : ""}: </span>
              {h.evidence}
              {h.verified === true && (
                <span className="mt-1 block text-xs font-semibold text-sage">✓ Double-checked against the video</span>
              )}
              {h.verified === false && (
                <span className="mt-1 block text-xs text-muted">Not double-checked (the check didn't finish). Confirm in person.</span>
              )}
            </p>
          </div>
        )}
        <p className="mt-1 text-muted">{h.why_it_matters}</p>
        {h.confidence < 0.75 && (
          <p className="mt-1 text-xs text-muted">Less certain from the video. Worth checking in person.</p>
        )}
        {h.personal_note && (
          <p className="mt-2 rounded-xl bg-soon-soft px-3 py-2 text-sm text-ink">
            <span className="font-semibold">For them: </span>
            {h.personal_note}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-sage-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sage">The fix</p>
          <p className="mt-1 font-medium">{h.fix}</p>
          <p className="mt-2 text-sm text-muted">
            {h.diy_or_pro === "pro"
              ? "Hire a professional. Anything anchored into walls needs to go into studs."
              : "A do-it-yourself fix."}
          </p>
          {h.needs_measurement && <p className="mt-2 text-sm">📏 {h.needs_measurement}</p>}
        </div>
        <div className="rounded-2xl bg-paper p-4 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Estimated cost</p>
          {price ? (
            <>
              <p className="mt-1 text-2xl font-bold">
                {fmtMoney(price.cost_low_usd)}–{fmtMoney(price.cost_high_usd)}
              </p>
              <p className="text-sm text-muted">
                {price.includes_installation ? "Including installation." : "Materials only."} {price.note}
              </p>
              {price.sources.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {price.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-sage underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : props.pricing ? (
            <p className="mt-1 text-muted">Checking current prices…</p>
          ) : (
            <button onClick={props.onRetryPrice} className="mt-1 text-sage underline">
              Get a price estimate
            </button>
          )}
        </div>
      </div>

      <WhereToBuy hazard={h} price={price} />

      <LocalHelp
        reportId={props.reportId}
        hazard={h}
        location={props.location}
        cached={props.local}
        onLocation={props.onLocation}
        onLoaded={props.onLocalLoaded}
      />

      <div>
        {props.isYouTube ? (
          <p className="rounded-2xl bg-paper p-4 text-sm text-muted ring-1 ring-line">
            Want to see this fix in the room? Upload your own walkthrough video. YouTube videos can be analyzed but
            not edited.
          </p>
        ) : clip ? (
          <BeforeAfter before={`/api/clip/${clip}-before.mp4`} after={`/api/clip/${clip}-after.mp4`} />
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line p-4">
            <button
              onClick={props.onVisualize}
              disabled={props.visualizing || !budget?.enabled || (budget?.remaining ?? 0) <= 0}
              className="rounded-full bg-ink px-5 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {props.visualizing ? "Creating the after view… (about a minute)" : "Show this room with the fix"}
            </button>
            <span className="text-sm text-muted">
              {!budget
                ? ""
                : !budget.enabled
                  ? "Visualizations are off."
                  : `${budget.remaining} of ${budget.max} visualizations left`}
            </span>
            {props.vizError && <p className="w-full text-sm text-urgent">{props.vizError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function WhereToBuy({ hazard: h, price }: { hazard: Hazard; price?: Price }) {
  const query = price?.search_query || h.title;
  const links = searchLinks(query);
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Where to buy</p>
        {h.diy_or_pro === "pro" && (
          <p className="text-xs text-muted">Buy the part, then have a professional install it.</p>
        )}
      </div>
      {price && price.products.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {price.products.map((p) => (
            <li key={p.url} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-sage underline">
                  {p.name}
                </a>
                <span className="text-sm text-muted">{p.retailer}</span>
              </div>
              {typeof p.price_usd === "number" && (
                <span className="shrink-0 font-semibold">{fmtMoney(Math.round(p.price_usd))}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {price ? "No specific products confirmed. Search these stores:" : "Finding products…"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Search “{query}” at</span>
        {links.map((l) => (
          <a
            key={l.retailer}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line px-3 py-1 hover:bg-paper"
          >
            {l.retailer}
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Check size and fit before buying. Prices change.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-card ring-1 ring-line" />
      ))}
    </div>
  );
}
