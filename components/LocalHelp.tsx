"use client";

import { useEffect, useState } from "react";
import type { Hazard, LocalHelp as LocalHelpT } from "@/lib/schema";
import { Button, ButtonLink, Panel, Tag, TextInput, fmtMiles, postJson } from "./ui";
import { ExternalIcon, PhoneIcon } from "./icons";

const LABEL: Record<string, string> = {
  "hardware store": "Hardware stores",
  electrician: "Electricians",
  plumber: "Plumbers",
  "aging in place contractor grab bar installation": "Grab bar installers",
  "handrail installation contractor": "Handrail installers",
  "general contractor": "General contractors",
  "flooring contractor": "Flooring contractors",
  "drywall repair": "Drywall repair",
  handyman: "Handymen",
};

export function LocalHelp(props: {
  reportId: string;
  hazard: Hazard;
  location: string | null;
  cached?: LocalHelpT;
  onLocation: (loc: string) => void;
  onLoaded: (help: LocalHelpT) => void;
}) {
  const { reportId, hazard: h, location } = props;
  // Results saved before distance filtering (no `farther` flag) are treated as missing, so they reload.
  const cached = props.cached && typeof props.cached.farther === "boolean" ? props.cached : undefined;
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(loc?: string) {
    setLoading(true);
    setError(null);
    try {
      const json = await postJson<LocalHelpT>(
        "/api/local",
        { id: reportId, hazardId: h.id, location: loc },
        "Couldn't load local businesses. Try again in a minute.",
      );
      if (loc) props.onLocation(loc);
      props.onLoaded(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load local businesses. Try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when we already know where the home is.
  useEffect(() => {
    if (location && !cached && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, h.id, cached]);

  const inputId = `local-zip-${h.id}`;
  return (
    <Panel as="section" aria-labelledby={`local-title-${h.id}`} data-reveal-item className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`local-title-${h.id}`} className="text-xl">
          Local help
        </h3>
        {cached && <p className="text-sm text-muted">{LABEL[cached.looking_for] ?? cached.looking_for}</p>}
      </div>

      {!location ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) load(draft.trim());
          }}
        >
          <label htmlFor={inputId} className="block">
            Add a ZIP code to see businesses nearby.
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <TextInput
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="95064"
              autoComplete="postal-code"
              maxLength={200}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" disabled={!draft.trim() || loading}>
              {loading ? "Searching…" : "Find local help"}
            </Button>
          </div>
        </form>
      ) : loading && !cached ? (
        <p className="text-muted" role="status">
          Finding businesses near {location}…
        </p>
      ) : cached && cached.places.length > 0 ? (
        <>
          {cached.farther && <p className="text-muted">Nothing within 25 miles. These are the nearest.</p>}
          <ul className="divide-y divide-line">
            {cached.places.map((p) => (
              <li key={`${p.name}-${p.address}`} className="space-y-1 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{p.name}</span>
                  {!p.is_chain && <Tag tone="info">Local business</Tag>}
                </div>
                <p className="text-sm text-muted tabular-nums">
                  {[
                    typeof p.distance_mi === "number" ? `${fmtMiles(p.distance_mi)} away` : null,
                    typeof p.rating === "number"
                      ? `${p.rating.toFixed(1)} stars${typeof p.reviews === "number" ? ` (${p.reviews.toLocaleString()})` : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {p.address && <p className="text-sm text-muted">{p.address}</p>}
                <div className="-ml-2 flex flex-wrap gap-x-2">
                  {p.phone && (
                    <ButtonLink href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} variant="ghost" className="whitespace-nowrap tabular-nums">
                      <PhoneIcon className="h-[18px] w-[18px]" />
                      {p.phone}
                    </ButtonLink>
                  )}
                  {p.website && (
                    <ButtonLink href={p.website} external variant="ghost" aria-label={`${p.name} website (opens in a new tab)`}>
                      Website
                      <ExternalIcon className="h-4 w-4" />
                    </ButtonLink>
                  )}
                  {p.maps_url && (
                    <ButtonLink href={p.maps_url} external variant="ghost" aria-label={`${p.name} on Google Maps (opens in a new tab)`}>
                      Google Maps
                      <ExternalIcon className="h-4 w-4" />
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : cached ? (
        <p className="text-muted">No matching businesses nearby.</p>
      ) : null}

      {error && (
        <p className="font-medium text-urgent" role="alert">
          {error}
        </p>
      )}
      <p className="text-sm text-muted">Business info from Google Maps. Independent businesses first. Steady isn&apos;t paid by any business.</p>
    </Panel>
  );
}
