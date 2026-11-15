"use client";

import { useEffect, useState } from "react";
import type { Hazard, LocalHelp as LocalHelpT } from "@/lib/schema";

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`} className="text-soon">
      {"★".repeat(full)}
      <span className="text-line">{"★".repeat(5 - full)}</span>
    </span>
  );
}

/** "0.4 mi", "3.2 mi", "12 mi": one decimal close by, whole miles beyond 10. */
function fmtMiles(mi: number): string {
  if (mi < 0.1) return "< 0.1 mi";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

const LABEL: Record<string, string> = {
  "hardware store": "Hardware stores",
  electrician: "Electricians",
  plumber: "Plumbers",
  "aging in place contractor grab bar installation": "Aging-in-place & grab bar installers",
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
      const res = await fetch("/api/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId, hazardId: h.id, location: loc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load local businesses");
      if (loc) props.onLocation(loc);
      props.onLoaded(json as LocalHelpT);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load local businesses");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when we already know where the home is.
  useEffect(() => {
    if (location && !cached && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, h.id, cached]);

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Local help near you</p>
        {cached && <p className="text-xs text-muted">{LABEL[cached.looking_for] ?? cached.looking_for}</p>}
      </div>

      {!location ? (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) load(draft.trim());
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ZIP code or address"
            maxLength={200}
            className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!draft.trim() || loading}
            className="rounded-full bg-sage px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Searching…" : "Find local help"}
          </button>
        </form>
      ) : loading && !cached ? (
        <p className="mt-2 text-sm text-muted">Finding businesses near {location}…</p>
      ) : cached && cached.places.length > 0 ? (
        <>
        {cached.farther && (
          <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-sm text-muted ring-1 ring-line">
            Nothing found within 25 miles of {location}. These are the nearest, farther away.
          </p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {cached.places.map((p) => (
            <li key={`${p.name}-${p.address}`} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                {!p.is_chain && (
                  <span className="rounded-full bg-sage-soft px-2 py-0.5 text-xs font-semibold text-sage">
                    Local business
                  </span>
                )}
                {typeof p.distance_mi === "number" && (
                  <span className="text-sm text-muted">{fmtMiles(p.distance_mi)} away</span>
                )}
              </div>
              {typeof p.rating === "number" && (
                <p className="text-sm">
                  <Stars rating={p.rating} /> <span className="font-medium">{p.rating.toFixed(1)}</span>
                  {typeof p.reviews === "number" && <span className="text-muted"> ({p.reviews.toLocaleString()} reviews)</span>}
                </p>
              )}
              {p.address && <p className="text-sm text-muted">{p.address}</p>}
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                {p.phone && (
                  <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-sage underline">
                    {p.phone}
                  </a>
                )}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer" className="text-sage underline">
                    Website
                  </a>
                )}
                {p.maps_url && (
                  <a href={p.maps_url} target="_blank" rel="noreferrer" className="text-sage underline">
                    View on Google Maps
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      ) : cached ? (
        <p className="mt-2 text-sm text-muted">No matching businesses found near {location}.</p>
      ) : null}

      {error && <p className="mt-2 text-sm text-urgent">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        Business info from Google Maps. Independent local businesses are listed first. Steady doesn&apos;t endorse or
        get paid by any business.
      </p>
    </div>
  );
}
