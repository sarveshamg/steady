import type { Hazard, Resident } from "./schema";
import { isPlainResident } from "./prompts";

/**
 * Accessibility upgrades that only matter for someone with reduced mobility, vision or balance.
 * For a person who walks on their own with nothing else reported, these are removed in code
 * (not just discouraged in the prompt), so the model can't slip them back in.
 */
const RAIL = /\b(hand\s?rail|railing|banister|rail)s?\b/i;
const ONE_SIDED =
  /\b(second|2nd|both sides|one side|one-side|single side|only (on )?(the )?(one|inner|inside|outer|open|banister|wall)|wall[- ]side|outer wall|outside wall|inner|inside|other side|opposite side|additional)\b/i;
const NO_RAIL_AT_ALL = /\b(no (hand\s?rail|railing|rail)s?( at all)?|without any (hand\s?rail|railing|rail))\b/i;

const DISABILITY_UPGRADES: RegExp[] = [
  /\bgrab ?bars?\b.*\b(toilet|commode)\b|\b(toilet|commode)\b.*\bgrab ?bars?\b/i,
  /\braised toilet|toilet (seat )?riser|low toilet\b/i,
  /\bdoor(way)? (is |are )?(too )?(narrow|width)|\bnarrow door(way)?s?\b|\b32 ?(in|inch)/i,
  /\bramp\b/i,
  /\bwheelchair|walker\b/i,
];

function text(h: Hazard) {
  return `${h.title} ${h.evidence ?? ""} ${h.fix} ${h.why_it_matters}`;
}

export function isDisabilityOnlyFinding(h: Hazard): boolean {
  if ((h.kind ?? "safety") !== "safety") return false;
  const t = text(h);
  // A staircase with no rail at all stays: that's a risk for everyone.
  const titleEvidence = `${h.title} ${h.evidence ?? ""}`;
  if (RAIL.test(t) && ONE_SIDED.test(t) && !NO_RAIL_AT_ALL.test(titleEvidence)) return true;
  return DISABILITY_UPGRADES.some((re) => re.test(t));
}

/** Apply person-specific rules that must hold regardless of what the model returned. */
export function applyResidentRules(hazards: Hazard[], resident: Resident | null | undefined): Hazard[] {
  if (!isPlainResident(resident)) return hazards;
  return hazards.filter((h) => !isDisabilityOnlyFinding(h)).map((h) => ({ ...h, personal_note: null }));
}
