import type { Hazard, LatLng, LocalPlace } from "./schema";

/** Results farther than this (straight line) are dropped. */
export const MAX_MILES = 25;
/** Places search bias radius, in meters (Places API max is 50 000). */
const BIAS_RADIUS_M = 40_000;
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

function mapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("MAPS_KEY_MISSING");
  return key;
}

/** Places API (New) Text Search. Errors include the status and body, never the key. */
async function placesSearch<T>(fieldMask: string[], body: Record<string, unknown>): Promise<T> {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsKey(), "X-Goog-FieldMask": fieldMask.join(",") },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

/**
 * Turn the user's ZIP code or address into a point plus a "City, ST 12345" label (no street). The caller caches
 * both on the report. Same Text Search request as before; addressComponents rides along in the field mask.
 */
export async function geocodeLocation(location: string): Promise<{ center: LatLng; area: string | null }> {
  const json = await placesSearch<{ places?: Array<{ location?: Partial<LatLng>; addressComponents?: AddressComponent[] }> }>(
    ["places.location", "places.addressComponents"],
    { textQuery: location, maxResultCount: 1, regionCode: "US" },
  );
  const place = json.places?.[0];
  const loc = place?.location;
  if (typeof loc?.latitude !== "number" || typeof loc?.longitude !== "number") throw new Error("LOCATION_NOT_FOUND");
  const comp = (type: string, short = false) => {
    const c = place?.addressComponents?.find((a) => a.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? null;
  };
  const city = comp("locality") ?? comp("postal_town") ?? comp("sublocality") ?? comp("administrative_area_level_2");
  const state = comp("administrative_area_level_1", true);
  const zip = comp("postal_code");
  const area = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  return { center: { latitude: loc.latitude, longitude: loc.longitude }, area };
}

/** Great-circle (straight-line) distance in miles. */
function milesBetween(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** Big-box and national chains: still shown, but after independent local businesses. */
const CHAINS =
  /\b(home depot|lowe'?s|walmart|target|ace hardware|true value|menards|costco|harbor freight|sears|amazon|angi|homeadvisor|thumbtack|taskrabbit|handy\b|mr\.? handyman|mr\.? electric|roto-?rooter|servpro|servicemaster|ars|one hour)\b/i;

/** What kind of help a fix needs. DIY fixes point to stores; pro fixes to the right trade. */
export function lookingFor(h: Hazard): string {
  const t = `${h.title} ${h.fix}`.toLowerCase();
  if (h.diy_or_pro === "diy") {
    if (/light|lamp|bulb|night ?light/.test(t)) return "hardware store";
    return "hardware store";
  }
  if (h.category === "electrical" || /wiring|outlet|switch|electric|light fixture|lighting/.test(t)) return "electrician";
  if (h.category === "water_damage" || /leak|plumb|water damage|pipe/.test(t)) return "plumber";
  if (/grab ?bar|shower|tub|toilet|bathroom/.test(t) || h.category === "bathroom")
    return "aging in place contractor grab bar installation";
  if (h.category === "stairs" || /handrail|railing|stair/.test(t)) return "handrail installation contractor";
  if (h.category === "crack") return "general contractor";
  if (/floor|carpet|tile|tread/.test(t)) return "flooring contractor";
  if (h.category === "surface_damage") return "drywall repair";
  return "handyman";
}

type PlacesResponse = {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    businessStatus?: string;
    location?: Partial<LatLng>;
  }>;
};

/**
 * Google Maps Places API (New) text search, biased to a 40 km circle around the home and then hard-filtered
 * to MAX_MILES. Structured results: nothing here comes from the language model.
 * If nothing is in range, returns the nearest 2 with farther: true.
 */
export async function searchLocal(
  query: string,
  location: string,
  center: LatLng,
): Promise<{ places: LocalPlace[]; farther: boolean }> {
  const json = await placesSearch<PlacesResponse>(
    [
      "places.displayName",
      "places.formattedAddress",
      "places.rating",
      "places.userRatingCount",
      "places.nationalPhoneNumber",
      "places.websiteUri",
      "places.googleMapsUri",
      "places.businessStatus",
      "places.location",
    ],
    {
      textQuery: `${query} near ${location}`,
      locationBias: { circle: { center, radius: BIAS_RADIUS_M } },
      maxResultCount: 10,
      regionCode: "US",
    },
  );

  const places = (json.places ?? [])
    .filter((p) => p.displayName?.text && (!p.businessStatus || p.businessStatus === "OPERATIONAL"))
    // Without coordinates we can't say how far it is, so it can't pass the distance check.
    .filter((p) => typeof p.location?.latitude === "number" && typeof p.location?.longitude === "number")
    .map<LocalPlace & { distance_mi: number }>((p) => ({
      name: p.displayName!.text!,
      address: p.formattedAddress ?? null,
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      maps_url: p.googleMapsUri ?? null,
      is_chain: CHAINS.test(p.displayName!.text!),
      distance_mi: milesBetween(center, p.location as LatLng),
    }));

  const inRange = places.filter((p) => p.distance_mi <= MAX_MILES);
  if (inRange.length === 0) {
    return { places: places.sort((a, b) => a.distance_mi - b.distance_mi).slice(0, 2), farther: true };
  }

  // Independent local businesses first, then nearer, then rating weighted by number of reviews.
  // Distance compares in whole miles so rating can still break ties between places a few blocks apart.
  const score = (p: LocalPlace) => (p.rating ?? 0) * Math.log10((p.reviews ?? 0) + 10);
  const sorted = inRange.sort(
    (a, b) =>
      Number(a.is_chain) - Number(b.is_chain) ||
      Math.round(a.distance_mi) - Math.round(b.distance_mi) ||
      score(b) - score(a),
  );
  return { places: sorted.slice(0, 4), farther: false };
}
