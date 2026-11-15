"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Funding, FundingProgram, Hazard, LocalHelp, Report } from "@/lib/schema";
import { bestProgram, buildPlan, callForHelp, firstSentence, programLabel, topPlace } from "@/lib/plan";
import { reportArea } from "@/lib/area";
import { searchLinks } from "@/lib/shopping";
import { Button, ButtonLink, Field, Panel, ProgressBar, Tag, TextInput, fmtMiles, fmtRange, postJson } from "./ui";
import { CheckIcon, ExternalIcon, PhoneIcon, SpinnerIcon } from "./icons";

/* Simple plan: large and calm. Text is 18px or larger and controls at least 48px. */
const post = <T,>(url: string, body: unknown) => postJson<T>(url, body);

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
    <div className="mx-auto max-w-3xl space-y-6 text-lg">
      {props.top && <Panel data-reveal-item>{props.top}</Panel>}

      <Panel className="space-y-4" data-reveal-item>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl">Your plan</h2>
            <p className="text-muted tabular-nums">
              {all.length === 0 ? "Nothing clear to fix from this video." : `${doneCount} of ${all.length} done`}
              {area ? `, near ${area}` : ""}
            </p>
          </div>
          {props.actions}
        </div>
        {all.length > 0 && (
          <ProgressBar value={doneCount} max={all.length} label="Plan progress" valueText={`${doneCount} of ${all.length} done`} />
        )}
      </Panel>

      <Section title="Do today, free" subtitle="Small changes that cost nothing." count={plan.today.length}>
        {plan.today.map((h) => (
          <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
            <p>{firstSentence(h.fix)}</p>
          </Item>
        ))}
      </Section>

      <Section
        title="Under $50, do it yourself"
        subtitle="Simple things to buy and put in."
        count={plan.cheap.length}
        pending={
          plan.pendingPrice.length > 0
            ? readOnly
              ? `${plan.pendingPrice.length} more not priced yet.`
              : `Checking prices for ${plan.pendingPrice.length} more…`
            : null
        }
      >
        {plan.cheap.map((h) => {
          const price = report.prices[h.id]!;
          const query = price.search_query || h.title;
          return (
            <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
              <p>{firstSentence(h.fix)}</p>
              <p className="font-semibold tabular-nums">
                {price.cost_low_usd > 0 ? "About " : ""}
                {fmtRange(price.cost_low_usd, price.cost_high_usd)}
              </p>
              <div className="-ml-2 flex flex-wrap items-center gap-x-1">
                <span className="ml-2 mr-1 text-muted">Find it at</span>
                {searchLinks(query).map((l) => (
                  <ButtonLink key={l.retailer} href={l.url} external variant="ghost" size="lg" className="font-medium">
                    {l.retailer}
                    <ExternalIcon className="h-4 w-4" />
                  </ButtonLink>
                ))}
              </div>
            </Item>
          );
        })}
      </Section>

      <Section title="Get help with" subtitle="Bigger jobs. Programs near you may pay for these, or do them." count={plan.help.length}>
        {!report.location && !readOnly && (
          <form onSubmit={saveLocation} className="py-6">
            <Field id="plan-location" label="Where is the home?" hint="Used only to find programs and businesses nearby.">
              <div className="flex flex-col gap-3 sm:flex-row">
                <TextInput
                  id="plan-location"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="ZIP code"
                  autoComplete="postal-code"
                  maxLength={200}
                  className="min-h-12 min-w-0 flex-1 text-lg"
                  aria-describedby="plan-location-hint"
                />
                <Button type="submit" size="lg" disabled={!draft.trim() || savingLoc}>
                  {savingLoc ? "Saving…" : "Find help near me"}
                </Button>
              </div>
            </Field>
            {locError && (
              <p className="mt-2 font-medium text-urgent" role="alert">
                {locError}
              </p>
            )}
          </form>
        )}

        {report.location && (
          <div className="-mx-4 sm:-mx-6">
            <CallForHelpCard
              program={caller}
              loading={fundingState === "loading"}
              error={fundingState === "error" ? fundingError : null}
              onRetry={() => loadFunding(true)}
              readOnly={readOnly}
            />
          </div>
        )}

        {plan.help.map((h) => {
          const program = bestProgram(report.funding, h.id);
          const place = topPlace(report, h.id);
          const price = report.prices[h.id];
          return (
            <Item key={h.id} hazard={h} done={done.includes(h.id)} onToggle={toggle} readOnly={readOnly} onMoreInfo={props.onMoreInfo}>
              <p>{firstSentence(h.fix)}</p>
              {price && (
                <p className="text-muted tabular-nums">
                  {price.cost_low_usd > 0 ? "Usually " : ""}
                  {fmtRange(price.cost_low_usd, price.cost_high_usd)}
                  {price.includes_installation ? " installed" : ""}.
                </p>
              )}
              {program ? (
                <ProgramBlock program={program} />
              ) : report.location && !report.funding && fundingState === "loading" ? (
                <p className="flex items-center gap-2 text-muted" role="status">
                  <SpinnerIcon className="h-5 w-5" />
                  Looking for programs that can help…
                </p>
              ) : (
                <p className="rounded-md bg-page px-4 py-3">Ask your local Area Agency on Aging about help with this.</p>
              )}
              {place ? (
                <div className="space-y-1">
                  <p className="font-semibold">Local business</p>
                  <p>
                    {place.name}
                    <span className="text-muted tabular-nums">
                      {[
                        typeof place.distance_mi === "number" ? `${fmtMiles(place.distance_mi)} away` : null,
                        typeof place.rating === "number" ? `${place.rating.toFixed(1)} stars` : null,
                      ]
                        .filter(Boolean)
                        .map((x) => `, ${x}`)
                        .join("")}
                    </span>
                  </p>
                  <div className="-ml-2 flex flex-wrap gap-x-2">
                    {place.phone && (
                      <ButtonLink href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} variant="ghost" size="lg" className="whitespace-nowrap tabular-nums">
                        <PhoneIcon />
                        Call {place.phone}
                      </ButtonLink>
                    )}
                    {place.maps_url && (
                      <ButtonLink
                        href={place.maps_url}
                        external
                        variant="ghost"
                        size="lg"
                        aria-label={`${place.name} on Google Maps (opens in a new tab)`}
                      >
                        Google Maps
                        <ExternalIcon className="h-4 w-4" />
                      </ButtonLink>
                    )}
                  </div>
                  <p className="text-muted">Business info from Google Maps.</p>
                </div>
              ) : localLoading[h.id] ? (
                <p className="flex items-center gap-2 text-muted" role="status">
                  <SpinnerIcon className="h-5 w-5" />
                  Finding a local business…
                </p>
              ) : null}
            </Item>
          );
        })}
      </Section>
    </div>
  );
}

function Section(props: { title: string; subtitle: string; count: number; pending?: string | null; children: ReactNode }) {
  const id = `plan-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Panel as="section" padding="none" aria-labelledby={id} data-reveal-item>
      <div className="border-b border-line px-6 py-4 sm:px-6">
        <h3 id={id} className="text-2xl">
          {props.title}
        </h3>
        <p className="text-muted">{props.subtitle}</p>
      </div>
      <div className="divide-y divide-line px-6 sm:px-6">
        {props.children}
        {props.count === 0 && !props.pending && <p className="py-6 text-muted">Nothing here this time.</p>}
      </div>
      {props.pending && (
        <p className="flex items-center gap-2 border-t border-line px-6 py-4 text-muted sm:px-6" role="status">
          {props.pending}
        </p>
      )}
    </Panel>
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
    <div data-reveal-item className="flex items-start gap-4 py-6">
      <input
        id={box}
        type="checkbox"
        checked={done}
        disabled={props.readOnly}
        onChange={() => props.onToggle(h.id)}
        className="check mt-1 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor={box} className={`cursor-pointer text-xl font-semibold ${done ? "text-muted line-through" : ""}`}>
            {h.title}
          </label>
          {done && (
            <Tag tone="success" size="lg">
              <CheckIcon className="h-4 w-4" />
              Done
            </Tag>
          )}
        </div>
        {h.personal_note && <p className="rounded-md bg-primary-soft px-4 py-3">{h.personal_note}</p>}
        {props.children}
        {props.onMoreInfo && !props.readOnly && (
          <Button variant="ghost" size="lg" className="-ml-2" onClick={() => props.onMoreInfo!(h)} aria-label={`More info about ${h.title}`}>
            More info
          </Button>
        )}
      </div>
    </div>
  );
}

const COST_LABEL: Record<FundingProgram["cost_to_family"], string> = {
  free: "Free",
  reduced: "Reduced cost",
  reimbursed: "You pay, then get paid back",
  loan: "A loan",
  unknown: "",
};

/** A verified assistance program. `bare` drops the tinted block (for use as a panel's whole content). */
export function ProgramBlock({ program: p, bare = false }: { program: FundingProgram; bare?: boolean }) {
  return (
    <div className={bare ? "space-y-2" : "space-y-2 rounded-md bg-page px-4 py-4"}>
      {/* Plan text is ≥18px; the bare version sits in the report detail, which uses the standard size. */}
      <Tag tone={p.does_the_work ? "success" : "info"} size={bare ? "sm" : "lg"}>
        {programLabel(p)}
      </Tag>
      <p className="font-semibold">{p.name}</p>
      <p>{p.covers}</p>
      {p.who_qualifies && (
        <p>
          <span className="font-semibold">Who may qualify: </span>
          {p.who_qualifies}
        </p>
      )}
      {p.cost_to_family !== "unknown" && (
        <p>
          <span className="font-semibold">Cost to you: </span>
          {COST_LABEL[p.cost_to_family]} (per their website)
        </p>
      )}
      <div className="-ml-2 flex flex-wrap gap-x-2">
        <ButtonLink href={p.url} external variant="ghost" size="lg" aria-label={`${p.name} website (opens in a new tab)`}>
          {p.official ? "Official site" : "Their website"}
          <ExternalIcon className="h-4 w-4" />
        </ButtonLink>
        {p.phone && (
          <ButtonLink href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} variant="ghost" size="lg" className="whitespace-nowrap tabular-nums">
            <PhoneIcon />
            Call {p.phone}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/** One number to call: the local Area Agency on Aging, or the Eldercare Locator. A full-width primary-soft row
 *  inside the "Get help with" panel (not a nested panel). */
export function CallForHelpCard(props: {
  program: FundingProgram | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  readOnly?: boolean;
}) {
  const p = props.program;
  return (
    <div className="space-y-3 bg-primary-soft px-4 py-6 sm:px-6" role="region" aria-label="Call for help">
      <p className="flex items-center gap-2 font-semibold text-primary">
        <PhoneIcon />
        Call for help
      </p>
      {p ? (
        <>
          <p className="text-2xl font-bold tracking-tight">{p.name}</p>
          <p>They help older adults arrange repairs, home modifications and other services. One call can connect you to the programs below.</p>
          <div className="flex flex-wrap gap-3 pt-1">
            {p.phone && (
              <ButtonLink
                href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                size="lg"
                className="whitespace-nowrap tabular-nums"
                aria-label={`Call ${p.name} at ${p.phone}`}
              >
                <PhoneIcon />
                Call {p.phone}
              </ButtonLink>
            )}
            <ButtonLink
              href={p.url}
              external
              size="lg"
              variant={p.phone ? "secondary" : "primary"}
              aria-label={`${p.name} website (opens in a new tab)`}
            >
              Visit their website
              <ExternalIcon className="h-4 w-4" />
            </ButtonLink>
          </div>
        </>
      ) : props.loading ? (
        <p className="flex items-center gap-2" role="status">
          <SpinnerIcon className="h-5 w-5 text-primary" />
          Finding your local Area Agency on Aging…
        </p>
      ) : props.error && !props.readOnly ? (
        <div className="space-y-3">
          <p className="text-urgent">{props.error}</p>
          <Button size="lg" onClick={props.onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <p>Your local Area Agency on Aging can help arrange repairs, home modifications and other services.</p>
      )}
    </div>
  );
}
