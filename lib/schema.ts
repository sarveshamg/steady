import { z } from "zod";
import { Type } from "@google/genai";

export const CATEGORIES = [
  "trip", "slip", "lighting", "stairs", "reach", "clearance", "bathroom", "other",
] as const;
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
  timestamp_s: z.number().min(0),
  room: z.string(),
  category: z.enum(CATEGORIES),
  title: z.string(),
  why_it_matters: z.string(),
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
  hazards: z.array(Hazard.omit({ id: true })),
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
          timestamp_s: { type: Type.NUMBER },
          room: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORIES] },
          title: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          fix: { type: Type.STRING },
          diy_or_pro: { type: Type.STRING, enum: ["diy", "pro"] },
          priority: { type: Type.STRING, enum: [...PRIORITIES] },
          confidence: { type: Type.NUMBER },
          needs_measurement: { type: Type.STRING, nullable: true },
          omni_edit_prompt: { type: Type.STRING },
          personal_note: { type: Type.STRING, nullable: true },
        },
        required: [
          "timestamp_s", "room", "category", "title", "why_it_matters", "fix",
          "diy_or_pro", "priority", "confidence", "omni_edit_prompt",
        ],
        propertyOrdering: [
          "timestamp_s", "room", "category", "title", "why_it_matters", "fix",
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
