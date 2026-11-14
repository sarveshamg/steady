import type { Product } from "./schema";

/** Retailers we link to. Product links on other domains are dropped. */
const RETAILERS: Record<string, string> = {
  "homedepot.com": "Home Depot",
  "lowes.com": "Lowe's",
  "amazon.com": "Amazon",
  "walmart.com": "Walmart",
  "target.com": "Target",
  "wayfair.com": "Wayfair",
  "acehardware.com": "Ace Hardware",
  "menards.com": "Menards",
  "costco.com": "Costco",
};

export function retailerFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const key = Object.keys(RETAILERS).find((d) => host === d || host.endsWith(`.${d}`));
    return key ? RETAILERS[key] : null;
  } catch {
    return null;
  }
}

function normalize(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url;
  }
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Grounding chunk links are Google redirect URLs; resolve them to the real page. */
export async function resolveRedirect(url: string): Promise<string> {
  const res = await withTimeout(
    (signal) => fetch(url, { method: "GET", redirect: "manual", signal }),
    4000,
  );
  const loc = res?.headers.get("location");
  return loc && /^https?:\/\//.test(loc) ? loc : url;
}

/**
 * A product link that isn't among the search results gets a live check: a 404/410 means the
 * model invented it. Retailers often block bots (403/429/503), which still proves the page exists.
 */
async function pageExists(url: string): Promise<boolean> {
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "GET",
        redirect: "follow",
        signal,
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Steady/1.0" },
      }),
    5000,
  );
  if (!res) return false;
  return res.status < 400 || [403, 429, 503].includes(res.status);
}

export async function verifyProducts(
  candidates: Array<{ name: string; retailer: string; price_usd?: number | null; url: string }>,
  groundedUrls: string[],
): Promise<Product[]> {
  const grounded = new Set(groundedUrls.map(normalize));
  const checked = await Promise.all(
    candidates.slice(0, 5).map(async (c): Promise<Product | null> => {
      const retailer = retailerFor(c.url);
      if (!retailer) return null;
      if (grounded.has(normalize(c.url))) {
        return { name: c.name, retailer, price_usd: c.price_usd ?? null, url: c.url, verified: "search_result" };
      }
      return (await pageExists(c.url))
        ? { name: c.name, retailer, price_usd: c.price_usd ?? null, url: c.url, verified: "page_checked" }
        : null;
    }),
  );
  const seen = new Set<string>();
  return checked
    .filter((p): p is Product => !!p)
    .filter((p) => {
      const k = normalize(p.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);
}

/** Search links always work, so every hazard has somewhere to shop even with no verified products. */
export function searchLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    { retailer: "Home Depot", url: `https://www.homedepot.com/s/${q}` },
    { retailer: "Amazon", url: `https://www.amazon.com/s?k=${q}` },
    { retailer: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${q}` },
    { retailer: "Walmart", url: `https://www.walmart.com/search?q=${q}` },
  ];
}
