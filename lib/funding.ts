import { z } from "zod";
import { vertexClient, ANALYSIS_MODEL, extractJson } from "./genai";
import { Funding, FundingCandidate, FundingProgram, FUNDING_RESPONSE_SCHEMA, type Hazard, type Resident } from "./schema";
import { fundingPrompt } from "./prompts";
import { normalize, resolveRedirect } from "./shopping";

/**
 * Help-paying-for-fixes search. Anti-hallucination, in order:
 *  1. Grounded Gemini call (Google Search) with strict "serves this area / copy URLs exactly" rules.
 *  2. Output validated with Zod; bad items are dropped individually.
 *  3. Each program's URL must match a resolved grounding URL or pass a live page check (404/410 = invented).
 *  4. Phone numbers and cost claims are kept only if the program's own page actually shows them.
 *  5. The Eldercare Locator fallback is shown only if its page is live right now.
 */

export const SURE = 0.75;
const MAX_PROGRAMS = 6;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Steady/1.0";
const ELDERCARE_URL = "https://eldercare.acl.gov/";

// Directory / lead-generation sites: never "official", even if the model links them.
const AGGREGATORS =
  /(^|\.)(yelp|facebook|linkedin|aplaceformom|caring|seniorliving|seniorly|payingforseniorcare|homeadvisor|angi|thumbtack|wikipedia|reddit|nextdoor|indeed|guidestar|charitynavigator|causeiq|findhelp)\./i;
const STOP = new Set(
  "county city state program programs home homes repair repairs services service agency aging area the for and of on in inc senior seniors department office community council center".split(" "),
);

type Page = { status: number; text: string | null };

/** Live GET with a short timeout. Text is kept (tags stripped, capped) for phone/cost checks. */
async function fetchPage(url: string): Promise<Page | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } });
    const type = res.headers.get("content-type") ?? "";
    let text: string | null = null;
    if (res.status < 400 && /text|html/.test(type)) {
      text = (await res.text())
        .slice(0, 600_000)
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ");
    }
    return { status: res.status, text };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** < 400 exists; bot walls (403/429/503) also prove the page exists. 404/410 (and anything else) = drop. */
const pageExists = (p: Page | null) => !!p && (p.status < 400 || [403, 429, 503].includes(p.status));

function phonesOn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g)) {
    out.add(m[0].replace(/\D/g, "").slice(-10));
  }
  return out;
}

const COST_EVIDENCE: Record<string, RegExp> = {
  free: /\b(free|no cost|no charge|at no cost|without cost)\b/i,
  reduced: /\b(reduced|sliding[- ]scale|discount|low[- ]cost|affordable)\b/i,
  reimbursed: /\breimburs/i,
  loan: /\bloans?\b/i,
};

function isOfficial(url: string, provider: string, name: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (/\.(gov|mil)$/.test(host) || /\.[a-z]{2}\.us$/.test(host)) return true;
  if (AGGREGATORS.test(`.${host}`)) return false;
  const base = host.split(".").slice(0, -1).join("");
  const words = `${provider} ${name}`.toLowerCase().match(/[a-z]+/g) ?? [];
  const tokens = words.filter((w) => w.length >= 4 && !STOP.has(w));
  const initials = words.filter((w) => !["of", "the", "and", "for", "on", "in"].includes(w)).map((w) => w[0]).join("");
  return tokens.some((t) => base.includes(t)) || (initials.length >= 3 && base.includes(initials));
}

/** Plain words, no promises: drop any sentence that guarantees eligibility or money. */
function noGuarantees(s: string): string {
  const kept = s.split(/(?<=[.!?])\s+/).filter((x) => !/\bguarantee/i.test(x));
  return kept.join(" ").trim() || "Contact the program to ask if you qualify.";
}

function describeResident(r: Resident | null | undefined): string {
  if (!r) return "an older adult (no other details given)";
  const bits = [
    r.mobility === "none" ? "walks without an aid" : `uses a ${r.mobility}`,
    r.low_vision ? "has low vision" : null,
    r.fell_recently ? "has fallen recently" : null,
  ].filter(Boolean);
  return `an older adult who ${bits.join(", ")}`;
}

const Loose = z.object({ programs: z.array(z.unknown()).default([]) });

async function askModel(area: string, hazards: Hazard[], resident: Resident | null) {
  const ai = vertexClient();
  const confident = hazards.filter((h) => h.confidence >= SURE);
  const prompt = fundingPrompt(
    area,
    confident.map((h) => ({ id: h.id, title: h.title, diy_or_pro: h.diy_or_pro, category: h.category })),
    describeResident(resident),
  );
  const grounded = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, abortSignal: AbortSignal.timeout(120_000) },
  });
  const text = grounded.text ?? "";
  let raw: z.infer<typeof Loose>;
  try {
    raw = Loose.parse(extractJson(text));
  } catch {
    // Same two-step pattern as lib/price.ts: convert grounded prose into the schema without inventing anything.
    const fixed = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: `Convert this into the JSON schema. Keep every URL exactly as written. Drop any program without a URL. Do not add programs, phone numbers or details that are not in the text.\n\n${text}`,
      config: { responseMimeType: "application/json", responseSchema: FUNDING_RESPONSE_SCHEMA, temperature: 0 },
    });
    raw = Loose.parse(extractJson(fixed.text ?? ""));
  }
  const candidates = raw.programs
    .map((p) => FundingCandidate.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data!);

  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundedUrls = await Promise.all(
    chunks
      .filter((c) => c.web?.uri)
      .slice(0, 15)
      .map((c) => resolveRedirect(c.web!.uri!)),
  );
  return { candidates, groundedUrls, confidentIds: new Set(confident.map((h) => h.id)) };
}

async function verify(
  c: z.infer<typeof FundingCandidate>,
  grounded: Set<string>,
  confidentIds: Set<string>,
): Promise<FundingProgram | null> {
  let raw = c.url.trim();
  // The model sometimes copies Google's temporary grounding redirect instead of the real page: resolve it, or drop
  // the program (those links expire, and they'd hide whether the destination is an official site).
  if (/^https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i.test(raw)) {
    const resolved = await resolveRedirect(raw);
    if (resolved === raw) return null;
    raw = resolved;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const href = url.toString();
  const inSearch = grounded.has(normalize(href));
  const page = await fetchPage(href);
  if (!inSearch && !pageExists(page)) return null;

  const text = page?.text ?? null;
  const phoneDigits = c.phone?.replace(/\D/g, "").slice(-10) ?? "";
  const phone = text && phoneDigits.length === 10 && phonesOn(text).has(phoneDigits) ? c.phone!.trim() : null;
  const cost = c.cost_to_family !== "unknown" && text && COST_EVIDENCE[c.cost_to_family]?.test(text) ? c.cost_to_family : "unknown";

  const parsed = FundingProgram.safeParse({
    name: c.name.trim(),
    provider: c.provider.trim() || c.name.trim(),
    covers: c.covers.trim(),
    who_qualifies: noGuarantees(c.who_qualifies.trim() || "Contact the program to ask if you qualify."),
    how_to_apply: c.how_to_apply.trim() || "Visit the program's website or call them to ask how to apply.",
    phone,
    url: href,
    matches_findings: c.matches_findings.filter((id) => confidentIds.has(id)),
    does_the_work: c.does_the_work,
    cost_to_family: cost,
    is_area_agency_on_aging: c.is_area_agency_on_aging || /area agency on aging|\bAAA\b/i.test(`${c.name} ${c.provider}`),
    official: isOfficial(href, c.provider, c.name),
    verified: inSearch ? "search_result" : "page_checked",
  });
  return parsed.success ? parsed.data : null;
}

/** National fallback, shown only if the page is live. Its phone is shown only if the page itself lists it. */
async function eldercareFallback(): Promise<FundingProgram | null> {
  const page = await fetchPage(ELDERCARE_URL);
  if (!pageExists(page)) return null;
  const phone = page?.text && /\b677[\s.-]?1116\b/.test(page.text) ? "1-800-677-1116" : null;
  return FundingProgram.parse({
    name: "Eldercare Locator",
    provider: "U.S. Administration for Community Living",
    covers: "The federal service that connects older adults to their local Area Agency on Aging.",
    who_qualifies: "Older adults, and family members or friends helping them.",
    how_to_apply: phone ? "Search by ZIP code on the website, or call." : "Search by ZIP code on the website.",
    phone,
    url: ELDERCARE_URL,
    matches_findings: [],
    does_the_work: false,
    cost_to_family: "unknown",
    is_area_agency_on_aging: false,
    official: true,
    verified: "page_checked",
    is_fallback: true,
  });
}

export async function findFunding(area: string, hazards: Hazard[], resident: Resident | null): Promise<Funding> {
  const [{ candidates, groundedUrls, confidentIds }, fallback] = await Promise.all([
    askModel(area, hazards, resident),
    eldercareFallback(),
  ]);
  const grounded = new Set(groundedUrls.map(normalize));
  const checked = await Promise.all(candidates.slice(0, MAX_PROGRAMS + 2).map((c) => verify(c, grounded, confidentIds)));

  const seen = new Set<string>();
  const rank = (p: FundingProgram) => (p.official ? 0 : 2) + (p.does_the_work && p.cost_to_family === "free" ? 0 : 1);
  const programs = checked
    .filter((p): p is FundingProgram => !!p)
    .filter((p) => {
      const k = normalize(p.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i) // stable: model order breaks ties
    .map(({ p }) => p)
    .slice(0, MAX_PROGRAMS);

  return Funding.parse({
    programs: fallback ? [...programs, fallback] : programs,
    checked_at: new Date().toISOString(),
    area,
  });
}
