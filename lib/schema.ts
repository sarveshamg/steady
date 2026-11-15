import { z } from "zod";
import { Type } from "@google/genai";

export const SAFETY_CATEGORIES = [
  "trip", "slip", "lighting", "stairs", "reach", "clearance", "bathroom", "fire", "egress", "other",
] as const;
export const CONDITION_CATEGORIES = [
  "water_damage", "crack", "surface_damage", "fixture", "electrical", "smoke_detector", "other_condition",
] as const;
export const CATEGORIES = [...SAFETY_CATEGORIES, ...CONDITION_CATEGORIES] as const;
export const KINDS = ["safety", "condition"] as const;
export const PRIORITIES = ["urgent", "soon", "nice_to_have"] as const;

export const Resident = z.object({
  mobility: z.enum(["none", "cane", "walker", "wheelchair"]),
  low_vision: z.boolean(),
  night_bathroom: z.boolean(),
  fell_recently: z.boolean(),
  other_needs: z.string().max(400).optional(),
});
export type Resident = z.infer<typeof Resident>;

export const Hazard = z.object({
  id: z.string(),
  kind: z.enum(KINDS).default("safety"),
  verified: z.boolean().optional(),
  timestamp_s: z.number().min(0),
  room: z.string(),
  category: z.enum(CATEGORIES),
  title: z.string(),
  why_it_matters: z.string(),
  evidence: z.string().optional().nullable(),
  fix: z.string(),
  diy_or_pro: z.enum(["diy", "pro"]),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1),
  needs_measurement: z.string().optional().nullable(),
  omni_edit_prompt: z.string(),
  personal_note: z.string().optional().nullable(),
});
export type Hazard = z.infer<typeof Hazard>;

// What the model returns (ids are assigned on the server).
export const AnalysisFromModel = z.object({
  rooms_covered: z.array(z.string()),
  hazards: z.array(Hazard.omit({ id: true, verified: true })),
});

export const Source = z.object({ title: z.string(), url: z.string() });
export const Product = z.object({
  name: z.string(),
  retailer: z.string(),
  price_usd: z.number().nullable().optional(),
  url: z.string(),
  verified: z.enum(["search_result", "page_checked"]),
});
export type Product = z.infer<typeof Product>;

export const Price = z.object({
  hazard_id: z.string(),
  products: z.array(Product).default([]),
  search_query: z.string().optional(),
  cost_low_usd: z.number().min(0),
  cost_high_usd: z.number().min(0),
  includes_installation: z.boolean(),
  note: z.string().optional().nullable(),
  sources: z.array(Source),
});
export type Price = z.infer<typeof Price>;

export const VideoSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upload") }),
  z.object({ type: z.literal("youtube"), url: z.string(), videoId: z.string() }),
]);
export type VideoSource = z.infer<typeof VideoSource>;

export const LocalPlace = z.object({
  name: z.string(),
  address: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviews: z.number().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  maps_url: z.string().optional().nullable(),
  is_chain: z.boolean(),
  distance_mi: z.number().optional().nullable(), // straight-line from the report's location
});
export type LocalPlace = z.infer<typeof LocalPlace>;
export const LocalHelp = z.object({
  hazard_id: z.string(),
  looking_for: z.string(), // e.g. "electrician", "hardware store"
  places: z.array(LocalPlace),
  // true when nothing was within range and `places` are the nearest ones beyond it.
  // Absent on results cached before distance filtering existed (those get refreshed).
  farther: z.boolean().optional(),
});
export const LatLng = z.object({ latitude: z.number(), longitude: z.number() });
export type LatLng = z.infer<typeof LatLng>;
export type LocalHelp = z.infer<typeof LocalHelp>;

// Programs that help pay for (or do) repairs. Every program shown has passed lib/funding.ts verification.
export const COST_TO_FAMILY = ["free", "reduced", "reimbursed", "loan", "unknown"] as const;
export const FundingProgram = z.object({
  name: z.string().min(2).max(200),
  provider: z.string().max(200),
  covers: z.string().max(600),
  who_qualifies: z.string().max(600),
  how_to_apply: z.string().max(600),
  phone: z.string().max(40).nullable().default(null), // only if found on the program's own page
  url: z.string().url(),
  matches_findings: z.array(z.string()).default([]),
  does_the_work: z.boolean(),
  cost_to_family: z.enum(COST_TO_FAMILY).catch("unknown"),
  is_area_agency_on_aging: z.boolean().default(false),
  official: z.boolean().default(false), // .gov or the provider's own domain
  verified: z.enum(["search_result", "page_checked"]),
  is_fallback: z.boolean().default(false), // the national Eldercare Locator card
});
export type FundingProgram = z.infer<typeof FundingProgram>;
export const Funding = z.object({
  programs: z.array(FundingProgram),
  checked_at: z.string(),
  area: z.string().nullable().default(null), // city/ZIP the search used (never a street address)
});
export type Funding = z.infer<typeof Funding>;

// What the grounded model call returns for one program (before verification).
export const FundingCandidate = z.object({
  name: z.string().min(2).max(200),
  provider: z.string().max(200).default(""),
  covers: z.string().max(600),
  who_qualifies: z.string().max(600).default(""),
  how_to_apply: z.string().max(600).default(""),
  phone: z.string().max(40).nullable().optional(),
  url: z.string(),
  matches_findings: z.array(z.string()).default([]),
  does_the_work: z.boolean().default(false),
  cost_to_family: z.enum(COST_TO_FAMILY).catch("unknown"),
  is_area_agency_on_aging: z.boolean().default(false),
});

export const Report = z.object({
  id: z.string(),
  source: VideoSource.default({ type: "upload" }),
  resident: Resident.nullable().default(null),
  created_at: z.string(),
  duration_s: z.number().nullable(),
  rooms_covered: z.array(z.string()),
  hazards: z.array(Hazard),
  prices: z.record(Price).default({}),
  clips: z.record(z.string()).default({}), // hazard_id -> clip file name
  location: z.string().max(200).nullable().default(null), // user-entered ZIP or address, only for local search
  location_geo: LatLng.nullable().default(null), // geocoded once from `location`; reset when it changes
  location_area: z.string().max(120).nullable().default(null), // "City, ST 12345" only: safe for prompts and sharing
  local: z.record(LocalHelp).default({}),
  funding: Funding.nullable().default(null), // cleared when location changes or findings are re-run
});
export type Report = z.infer<typeof Report>;

// Gemini response schema mirroring AnalysisFromModel.
export const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rooms_covered: { type: Type.ARRAY, items: { type: Type.STRING } },
    hazards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: [...KINDS] },
          timestamp_s: { type: Type.NUMBER },
          room: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORIES] },
          title: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          evidence: { type: Type.STRING },
          fix: { type: Type.STRING },
          diy_or_pro: { type: Type.STRING, enum: ["diy", "pro"] },
          priority: { type: Type.STRING, enum: [...PRIORITIES] },
          confidence: { type: Type.NUMBER },
          needs_measurement: { type: Type.STRING, nullable: true },
          omni_edit_prompt: { type: Type.STRING },
          personal_note: { type: Type.STRING, nullable: true },
        },
        required: [
          "kind", "timestamp_s", "room", "category", "title", "why_it_matters", "evidence", "fix",
          "diy_or_pro", "priority", "confidence", "omni_edit_prompt",
        ],
        propertyOrdering: [
          "kind", "timestamp_s", "room", "category", "title", "evidence", "why_it_matters", "fix",
          "diy_or_pro", "priority", "confidence", "needs_measurement", "omni_edit_prompt", "personal_note",
        ],
      },
    },
  },
  required: ["rooms_covered", "hazards"],
};

export const PRICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cost_low_usd: { type: Type.NUMBER },
    cost_high_usd: { type: Type.NUMBER },
    includes_installation: { type: Type.BOOLEAN },
    note: { type: Type.STRING, nullable: true },
    search_query: { type: Type.STRING },
    products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          retailer: { type: Type.STRING },
          price_usd: { type: Type.NUMBER, nullable: true },
          url: { type: Type.STRING },
        },
        required: ["name", "retailer", "url"],
      },
    },
  },
  required: ["cost_low_usd", "cost_high_usd", "includes_installation", "search_query"],
};

export const FUNDING_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    programs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          provider: { type: Type.STRING },
          covers: { type: Type.STRING },
          who_qualifies: { type: Type.STRING },
          how_to_apply: { type: Type.STRING },
          phone: { type: Type.STRING, nullable: true },
          url: { type: Type.STRING },
          matches_findings: { type: Type.ARRAY, items: { type: Type.STRING } },
          does_the_work: { type: Type.BOOLEAN },
          cost_to_family: { type: Type.STRING, enum: [...COST_TO_FAMILY] },
          is_area_agency_on_aging: { type: Type.BOOLEAN },
        },
        required: ["name", "provider", "covers", "who_qualifies", "how_to_apply", "url", "does_the_work", "cost_to_family"],
      },
    },
  },
  required: ["programs"],
};

export const LISTEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { script: { type: Type.STRING } },
  required: ["script"],
};

export const VERIFY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          visible: { type: Type.BOOLEAN },
          corrected_timestamp_s: { type: Type.NUMBER, nullable: true },
          reason: { type: Type.STRING },
        },
        required: ["id", "visible", "reason"],
      },
    },
  },
  required: ["results"],
};

export const FRAME_CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    visible: { type: Type.BOOLEAN },
    best_frame: { type: Type.INTEGER },
    reason: { type: Type.STRING },
  },
  required: ["visible", "reason"],
};
