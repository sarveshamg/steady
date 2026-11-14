import { vertexClient, ANALYSIS_MODEL, extractJson } from "./genai";
import { Hazard, Price, PRICE_RESPONSE_SCHEMA } from "./schema";
import { pricePrompt } from "./prompts";
import { resolveRedirect, verifyProducts } from "./shopping";
import { z } from "zod";

const PriceCore = z.object({
  cost_low_usd: z.number().min(0),
  cost_high_usd: z.number().min(0),
  includes_installation: z.boolean(),
  note: z.string().optional().nullable(),
  search_query: z.string().optional(),
  products: z
    .array(
      z.object({
        name: z.string(),
        retailer: z.string(),
        price_usd: z.number().nullable().optional(),
        url: z.string(),
      }),
    )
    .default([]),
});

/**
 * Grounded price estimate + products for one fix.
 * (1) Grounded call with Google Search returns text + grounding sources.
 * (2) If the text isn't clean JSON, a schema-constrained call converts it.
 * (3) Product links are kept only if they match a search result or pass a live page check.
 */
export async function priceHazard(h: Hazard): Promise<Price> {
  const ai = vertexClient();
  const grounded = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: pricePrompt(h.fix, h.diy_or_pro),
    config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
  });

  const text = grounded.text ?? "";
  let core: z.infer<typeof PriceCore>;
  try {
    core = PriceCore.parse(extractJson(text));
  } catch {
    const fixed = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: `Convert this into the JSON schema. Keep product URLs exactly as written; drop any product without a URL. If it gives no price numbers, use your best typical US estimate.\n\n${text}`,
      config: { responseMimeType: "application/json", responseSchema: PRICE_RESPONSE_SCHEMA, temperature: 0 },
    });
    core = PriceCore.parse(extractJson(fixed.text ?? ""));
  }

  // Grounding chunks are Google redirect links: resolve them to the real pages.
  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const resolved = await Promise.all(
    chunks
      .filter((c) => c.web?.uri)
      .slice(0, 10)
      .map(async (c) => ({ title: c.web?.title ?? "Source", url: await resolveRedirect(c.web!.uri!) })),
  );
  const seen = new Set<string>();
  const sources = resolved
    .filter((s) => {
      if (!s.url || seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })
    .slice(0, 3);

  const products = await verifyProducts(
    core.products,
    resolved.map((r) => r.url),
  );

  const low = Math.round(Math.min(core.cost_low_usd, core.cost_high_usd));
  const high = Math.round(Math.max(core.cost_low_usd, core.cost_high_usd));
  return Price.parse({
    hazard_id: h.id,
    cost_low_usd: low,
    cost_high_usd: high,
    includes_installation: core.includes_installation,
    note: core.note ?? null,
    sources,
    products,
    search_query: core.search_query?.trim() || h.title,
  });
}
