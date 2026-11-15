"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Funding, FundingProgram, Hazard, LocalHelp, Report } from "@/lib/schema";
import { bestProgram, buildPlan, callForHelp, firstSentence, programLabel, topPlace } from "@/lib/plan";
import { reportArea } from "@/lib/area";
import { searchLinks } from "@/lib/shopping";
import { fmtMoney } from "./ui";

/* Accessibility baseline for everything in this file: ≥18px text, ≥48px controls, visible focus (globals.css),
   plain words. */
const BTN =
  "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-lg font-semibold focus-visible:outline-3";
const LINK = "text-lg font-semibold text-sage underline underline-offset-4";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}

const storageKey = (id: string) => `steady-plan-done-${id}`;

function readDone(id: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDone(id: string, done: string[]) {
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(done));
  } catch {
    /* private mode / blocked storage: the checkbox still works for this visit */
  }
}

const fmtMiles = (mi: number) => `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;

export function SimplePlan(props: {
  report: Report;
  readOnly?: boolean;
  pricing?: Record<string, boolean>;
  top?: ReactNode; // e.g. the Listen card
  actions?: ReactNode; // e.g. the Share button
  onMoreInfo?: (h: Hazard) => void;
  onLocationSaved?: (location: string) => void;
  onFunding?: (f: Funding) => void;
  onLocal?: (help: LocalHelp) => void;
}) {
  const { report, readOnly } = props;
  const plan = buildPlan(report);
  const all = [...plan.today, ...plan.cheap, ...plan.help];
  const area = reportArea(report);

  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(readDone(report.id)), [report.id]);
  function toggle(id: string) {
    if (readOnly) return;
    setDone((d) => {
      const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      writeDone(report.id, next);
      return next;
    });
  }
  const doneCount = all.filter((h) => done.includes(h.id)).length;

  // ---- Funding + local help (interactive view only; the share page never calls paid APIs) ----
  const [fundingState, setFundingState] = useState<"idle" | "loading" | "error">("idle");
  const [fundingError, setFundingError] = useState<string | null>(null);
  const fundingFor = useRef<string | null>(null);
  async function loadFunding(force = false) {
    setFundingState("loading");
    setFundingError(null);
    try {
      props.onFunding?.(await post<Funding>("/api/funding", { id: report.id, force }));
      setFundingState("idle");
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : "Couldn't look up help programs.");
      setFundingState("error");
    }
  }
  useEffect(() => {
    if (readOnly || !report.location || report.funding) return;
    if (fundingFor.current === report.location) return; // once per location (also guards StrictMode double effects)
    fundingFor.current = report.location;
    loadFunding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, report.location, report.funding]);

  const helpIds = plan.help.map((h) => h.id).join(",");
  const localStarted = useRef<string | null>(null);
  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (readOnly || !report.location || !helpIds) return;
    const key = `${report.location}|${helpIds}`;
    if (localStarted.current === key) return; // once per location + item set (also guards StrictMode)
    localStarted.current = key;
    (async () => {
      // One at a time, same as pricing: gentle on rate limits. Stops if the location or items change.
      for (const h of plan.help) {
        if (localStarted.current !== key) break;
        if (topPlace(report, h.id)) continue;
        setLocalLoading((l) => ({ ...l, [h.id]: true }));
        try {
          props.onLocal?.(await post<LocalHelp>("/api/local", { id: report.id, hazardId: h.id }));
        } catch {
          /* the item still shows its program / Area Agency on Aging line */
        } finally {
          setLocalLoading((l) => ({ ...l, [h.id]: false }));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, report.location, helpIds]);

  const [draft, setDraft] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    const loc = draft.trim();
    if (!loc) return;
    setSavingLoc(true);
    setLocError(null);
    try {
      await post("/api/location", { id: report.id, location: loc });
      fundingFor.current = null;
      props.onLocationSaved?.(loc);
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSavingLoc(false);
    }
  }

  const caller = callForHelp(report.funding);

  return (
    <div className="mx-auto max-w-3xl space-y-8 text-lg leading-relaxed text-ink">
      {props.top}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-card p-5 ring-1 ring-line">
        <div>
          <h2 className="text-2xl font-bold">Your simple plan</h2>
          <p className="text-lg text-muted">
            {all.length === 0
              ? "Nothing clear to fix from this video."
              : `${doneCount} of ${all.length} done`}
            {area ? ` · Near ${area}` : ""}
          </p>
        </div>
        {props.actions}
      </div>
      {all.length > 0 && (
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Plan progress"
          aria-valuemin={0}
          aria-valuemax={all.length}
          aria-valuenow={doneCount}
        >
          <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${(doneCount / all.length) * 100}%` }} />
        </div>
      )}

      <Section title="Do today, free" subtitle="Small changes that cost nothing." empty="Nothing here this time.">
        {plan.today.map((h) => (
          <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
            <p>{firstSentence(h.fix)}</p>
          </Item>
        ))}
      </Section>

      <Section
        title="Under $50, do it yourself"
        subtitle="Simple fixes you can buy at a hardware store or online."
        empty={plan.pendingPrice.length > 0 ? null : "Nothing here this time."}
      >
        {plan.cheap.map((h) => {
          const price = report.prices[h.id]!;
          const query = price.search_query || h.title;
          return (
            <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
              <p>{firstSentence(h.fix)}</p>
              <p className="font-semibold">
                About {fmtMoney(price.cost_low_usd)}–{fmtMoney(price.cost_high_usd)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Find it at</span>
                {searchLinks(query).map((l) => (
                  <a
                    key={l.retailer}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 items-center rounded-full border-2 border-line px-4 font-medium hover:bg-paper"
                    aria-label={`Search ${l.retailer} for ${query} (opens in a new tab)`}
                  >
                    {l.retailer}
                  </a>
                ))}
              </div>
            </Item>
          );
        })}
        {plan.pendingPrice.length > 0 && (
          <p className="text-muted" role="status">
            {readOnly
              ? `${plan.pendingPrice.length} more ${plan.pendingPrice.length === 1 ? "item hasn't" : "items haven't"} been priced yet.`
              : `Checking prices for ${plan.pendingPrice.length} more ${plan.pendingPrice.length === 1 ? "item" : "items"}…`}
          </p>
        )}
      </Section>

      <Section title="Get help with" subtitle="Bigger jobs. Programs near you may pay for these, or do them for you." empty={null}>
        {!report.location && !readOnly && (
          <form onSubmit={saveLocation} className="space-y-3 rounded-2xl bg-sage-soft p-5">
            <label htmlFor="plan-location" className="block text-lg font-semibold">
              Where is the home? We&apos;ll find programs and local help nearby.
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="plan-location"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="ZIP code, like 95060"
                autoComplete="postal-code"
                maxLength={200}
                className="min-h-12 min-w-0 flex-1 rounded-full border-2 border-line bg-card px-5 text-lg"
              />
              <button type="submit" disabled={!draft.trim() || savingLoc} className={`${BTN} bg-sage text-white disabled:opacity-50`}>
                {savingLoc ? "Saving…" : "Find help near me"}
              </button>
            </div>
            <p className="text-lg text-muted">A ZIP code is enough. We only use it to search for help nearby.</p>
            {locError && <p className="text-urgent">{locError}</p>}
          </form>
        )}

        {report.location && (
          <CallForHelpCard
            program={caller}
            loading={fundingState === "loading"}
            error={fundingState === "error" ? fundingError : null}
            onRetry={() => loadFunding(true)}
            readOnly={readOnly}
          />
        )}

        {plan.help.length === 0 && <p className="text-muted">Nothing here this time.</p>}
        {plan.help.map((h) => {
          const program = bestProgram(report.funding, h.id);
          const place = topPlace(report, h.id);
          const price = report.prices[h.id];
          return (
            <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
              <p>{firstSentence(h.fix)}</p>
              {price && (
                <p className="text-muted">
                  Usually about {fmtMoney(price.cost_low_usd)}–{fmtMoney(price.cost_high_usd)}
                  {price.includes_installation ? " with installation" : ""}.
                </p>
              )}
              {program ? (
                <ProgramBox program={program} />
              ) : report.funding ? (
                <p className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  Ask your local Area Agency on Aging about help with this.
                </p>
              ) : report.location && fundingState === "loading" ? (
                <p className="text-muted" role="status">Looking for programs that can help…</p>
              ) : (
                <p className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  Ask your local Area Agency on Aging about help with this.
                </p>
              )}
              {place ? (
                <div className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  <p className="text-lg font-semibold uppercase tracking-wide text-muted">Local business</p>
                  <p className="font-semibold">
                    {place.name}
                    {typeof place.distance_mi === "number" && (
                      <span className="font-normal text-muted"> · {fmtMiles(place.distance_mi)} away</span>
                    )}
                  </p>
                  {typeof place.rating === "number" && (
                    <p className="text-muted">
                      {place.rating.toFixed(1)} stars
                      {typeof place.reviews === "number" ? ` (${place.reviews.toLocaleString()} reviews)` : ""}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                    {place.phone && (
                      <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} className={`${LINK} inline-flex min-h-12 items-center`}>
                        Call {place.phone}
                      </a>
                    )}
                    {place.maps_url && (
                      <a href={place.maps_url} target="_blank" rel="noreferrer" className={`${LINK} inline-flex min-h-12 items-center`}>
                        View on Google Maps
                      </a>
                    )}
                  </div>
                  <p className="text-lg text-muted">Business info from Google Maps.</p>
                </div>
              ) : localLoading[h.id] ? (
                <p className="text-muted" role="status">Finding a local business…</p>
              ) : null}
            </Item>
          );
        })}
      </Section>

      <p className="text-lg text-muted">
        Steady is a starting point, not a professional assessment. Programs and prices change: check with each program
        before you count on it. For electrical, gas, plumbing or structural work, use a licensed professional.
      </p>
    </div>
  );
}

function Section(props: { title: string; subtitle: string; empty: string | null; children: ReactNode }) {
  const kids = Array.isArray(props.children) ? props.children.flat().filter(Boolean) : props.children ? [props.children] : [];
  const id = `plan-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h3 id={id} className="text-2xl font-bold">
          {props.title}
        </h3>
        <p className="text-lg text-muted">{props.subtitle}</p>
      </div>
      {kids.length === 0 && props.empty ? <p className="text-muted">{props.empty}</p> : props.children}
    </section>
  );
}

function Item(props: {
  hazard: Hazard;
  done: boolean;
  readOnly?: boolean;
  onToggle: (id: string) => void;
  onMoreInfo?: (h: Hazard) => void;
  children: ReactNode;
}) {
  const { hazard: h, done } = props;
  const box = `done-${h.id}`;
  return (
    <div className={`rounded-3xl bg-card p-5 ring-1 ring-line ${done ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-4">
        <input
          id={box}
          type="checkbox"
          checked={done}
          disabled={props.readOnly}
          onChange={() => props.onToggle(h.id)}
          className="mt-1 h-8 w-8 shrink-0 cursor-pointer accent-[#2f6b4f] disabled:cursor-default"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <label htmlFor={box} className={`block cursor-pointer text-xl font-semibold ${done ? "line-through" : ""}`}>
            {h.title}
            <span className="sr-only">{done ? " (done)" : " (not done yet)"}</span>
          </label>
          {h.personal_note && <p className="rounded-2xl bg-soon-soft px-4 py-2">{h.personal_note}</p>}
          {props.children}
          {props.onMoreInfo && !props.readOnly && (
            <button
              type="button"
              onClick={() => props.onMoreInfo!(h)}
              className={`${BTN} border-2 border-line bg-card px-5 hover:bg-paper`}
              aria-label={`More info about: ${h.title}`}
            >
              More info
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgramBox({ program: p }: { program: FundingProgram }) {
  return (
    <div className="rounded-2xl bg-sage-soft p-4">
      <p className="inline-block rounded-full bg-sage px-3 py-1 text-lg font-semibold text-white">{programLabel(p)}</p>
      <p className="mt-2 text-xl font-semibold">{p.name}</p>
      {p.provider && p.provider !== p.name && <p className="text-muted">{p.provider}</p>}
      <p className="mt-1">{p.covers}</p>
      {p.who_qualifies && (
        <p className="mt-1">
          <span className="font-semibold">Who may qualify: </span>
          {p.who_qualifies}
        </p>
      )}
      {p.cost_to_family !== "unknown" && (
        <p className="mt-1">
          <span className="font-semibold">Cost to you: </span>
          {{ free: "Free", reduced: "Reduced cost", reimbursed: "You pay, then get paid back", loan: "A loan", unknown: "" }[p.cost_to_family]}
          {" "}(says their website)
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        <a href={p.url} target="_blank" rel="noreferrer" className={`${LINK} inline-flex min-h-12 items-center`}>
          Visit {p.official ? "their official site" : "their website"}
          <span className="sr-only"> for {p.name} (opens in a new tab)</span>
        </a>
        {p.phone && (
          <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className={`${LINK} inline-flex min-h-12 items-center`}>
            Call {p.phone}
          </a>
        )}
      </div>
    </div>
  );
}

/** Part 3: one big card with one number to call. Only the Area Agency on Aging or the Eldercare Locator. */
export function CallForHelpCard(props: {
  program: FundingProgram | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  readOnly?: boolean;
}) {
  const p = props.program;
  return (
    <div className="rounded-3xl bg-ink p-6 text-white shadow-sm" role="region" aria-label="Call for help">
      <p className="text-lg font-semibold uppercase tracking-wider text-white/80">Call for help</p>
      {p ? (
        <>
          <p className="mt-1 text-2xl font-bold">{p.name}</p>
          <p className="mt-2 text-lg text-white/90">
            They help older adults arrange repairs, home modifications and other services. One call can connect you to the
            programs above.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {p.phone && (
              <a
                href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                className={`${BTN} min-h-14 bg-white px-8 text-xl text-ink focus-visible:outline-white`}
                aria-label={`Call ${p.name} at ${p.phone}`}
              >
                Call {p.phone}
              </a>
            )}
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className={`${BTN} border-2 border-white/70 text-white focus-visible:outline-white`}
              aria-label={`Visit the ${p.name} website (opens in a new tab)`}
            >
              Visit their website
            </a>
          </div>
        </>
      ) : props.loading ? (
        <p className="mt-2 text-lg text-white/90" role="status">
          Finding your local Area Agency on Aging…
        </p>
      ) : props.error && !props.readOnly ? (
        <div className="mt-2 space-y-3">
          <p className="text-lg text-white/90">{props.error}</p>
          <button type="button" onClick={props.onRetry} className={`${BTN} bg-white text-ink focus-visible:outline-white`}>
            Try again
          </button>
        </div>
      ) : (
        <p className="mt-2 text-lg text-white/90">
          Your local Area Agency on Aging can help older adults arrange repairs, home modifications and other services.
        </p>
      )}
    </div>
  );
}
