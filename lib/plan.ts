import type { Funding, FundingProgram, Hazard, LocalPlace, Price, Report } from "./schema";

/**
 * The "Simple plan": one video → what you can fix today for free, what's cheap to do yourself, and who will help
 * pay for (or do) the rest. Pure functions, shared by the report page, the share page and the read-aloud script.
 */

export const SURE = 0.75;
export const CHEAP_MAX_USD = 50;

const ORDER = { urgent: 0, soon: 1, nice_to_have: 2 } as const;

// "Obviously free": the fix is just moving, removing, clearing or rearranging what's already there.
const FREE_START = /^\s*(move|remove|clear|rearrange|relocate|put away|pick up|tuck|take up|roll up|declutter|tidy|keep)\b/i;
const COSTS_MONEY =
  /\b(buy|purchase|install|replace|add|new|tape|pad|mat|bulb|strip|clips?|grab ?bars?|rails?|handrails?|lights?|lamps?|hire|call|contractor|professional)\b/i;

export function isObviouslyFree(fix: string): boolean {
  return FREE_START.test(fix) && !COSTS_MONEY.test(fix);
}

export function firstSentence(s: string): string {
  const t = s.trim();
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

export type Plan = {
  today: Hazard[]; // free
  cheap: Hazard[]; // DIY, priced at most $50
  help: Hazard[]; // pro jobs and anything over $50
  pendingPrice: Hazard[]; // DIY findings still waiting for a price
};

export function buildPlan(report: Pick<Report, "hazards" | "prices">): Plan {
  const plan: Plan = { today: [], cheap: [], help: [], pendingPrice: [] };
  const sure = report.hazards
    .filter((h) => h.confidence >= SURE)
    .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.confidence - a.confidence);
  for (const h of sure) {
    const price: Price | undefined = report.prices[h.id];
    if (price?.cost_high_usd === 0 || (h.diy_or_pro === "diy" && isObviouslyFree(h.fix))) plan.today.push(h);
    else if (h.diy_or_pro === "diy" && !price) plan.pendingPrice.push(h);
    else if (h.diy_or_pro === "diy" && price && price.cost_high_usd <= CHEAP_MAX_USD) plan.cheap.push(h);
    else plan.help.push(h);
  }
  return plan;
}

/** Best program for one finding: the verified list is already sorted (official, then free-and-does-the-work). */
export function bestProgram(funding: Funding | null | undefined, hazardId: string): FundingProgram | null {
  return funding?.programs.find((p) => !p.is_fallback && p.matches_findings.includes(hazardId)) ?? null;
}

/** The one number to call: the local Area Agency on Aging if found and verified, else the Eldercare Locator. */
export function callForHelp(funding: Funding | null | undefined): FundingProgram | null {
  if (!funding) return null;
  return (
    funding.programs.find((p) => p.is_area_agency_on_aging && !p.is_fallback) ??
    funding.programs.find((p) => p.is_fallback) ??
    null
  );
}

/** Top nearby business for a finding, from Local help (only fresh, distance-checked results). */
export function topPlace(report: Pick<Report, "local">, hazardId: string): LocalPlace | null {
  const help = report.local[hazardId];
  if (!help || typeof help.farther !== "boolean") return null;
  return help.places[0] ?? null;
}

export function programLabel(p: FundingProgram): string {
  return p.does_the_work ? "They can do it for you" : "Can help pay";
}
