import { env } from "../config/env.js";
import { httpError } from "../errors/httpError.js";
import { validateExternalUrl } from "./policy/externalUrlPolicyService.js";

type Place = { id?: unknown; displayName?: { text?: unknown }; formattedAddress?: unknown; rating?: unknown; userRatingCount?: unknown; businessStatus?: unknown; websiteUri?: unknown; googleMapsUri?: unknown };
export type LiveHouseholdProvider = { providerId: "google-places"; placeId: string; name: string; address: string; rating: number | null; reviewCount: number; businessStatus: string; websiteAvailable: boolean; googleMapsUrl: string | null; mode: "live" };
const fields = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri,places.googleMapsUri";

function requireLive() { if (env.LIVE_HOUSEHOLD_ENABLED !== "true") throw httpError(503, "Live household discovery is not enabled for this environment.", "live_household_disabled"); if (!env.GOOGLE_PLACES_API_KEY) throw httpError(503, "Google Places is not configured.", "google_places_not_configured"); }
async function googleRequest(url: string, init: RequestInit) {
  requireLive(); const controller = new globalThis.AbortController(); const timer = setTimeout(() => controller.abort(), env.HOUSEHOLD_PROVIDER_TIMEOUT_MS);
  try { const response = await fetch(url, { ...init, signal: controller.signal, headers: { ...init.headers, "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY! } }); if (!response.ok) throw httpError(response.status === 429 ? 503 : 502, "Google Places could not complete the request.", response.status === 429 ? "google_places_rate_limited" : "google_places_provider_error"); return await response.json() as Record<string, unknown>; }
  catch (error) { if (error instanceof Error && error.name === "AbortError") throw httpError(504, "Google Places timed out.", "google_places_timeout"); throw error; }
  finally { clearTimeout(timer); }
}

export function normalizeHouseholdPlace(value: Place): LiveHouseholdProvider | null {
  const placeId = typeof value.id === "string" ? value.id.trim() : ""; const name = typeof value.displayName?.text === "string" ? value.displayName.text.trim() : ""; const address = typeof value.formattedAddress === "string" ? value.formattedAddress.trim() : "";
  if (!placeId || !name || !address) return null;
  const maps = typeof value.googleMapsUri === "string" ? validateExternalUrl(value.googleMapsUri) : null;
  return { providerId: "google-places", placeId, name, address, rating: typeof value.rating === "number" && value.rating >= 1 && value.rating <= 5 ? value.rating : null, reviewCount: typeof value.userRatingCount === "number" && value.userRatingCount >= 0 ? Math.floor(value.userRatingCount) : 0, businessStatus: typeof value.businessStatus === "string" ? value.businessStatus : "BUSINESS_STATUS_UNSPECIFIED", websiteAvailable: typeof value.websiteUri === "string", googleMapsUrl: maps?.allowed ? maps.url.toString() : null, mode: "live" };
}

export async function searchLiveHouseholdProviders(input: { serviceType: string; location: string }) {
  const body = await googleRequest("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-FieldMask": fields }, body: JSON.stringify({ textQuery: `${input.serviceType} in ${input.location}`, pageSize: 10 }) });
  const providers = (Array.isArray(body.places) ? body.places : []).map((item) => normalizeHouseholdPlace(item as Place)).filter((item): item is LiveHouseholdProvider => Boolean(item)).filter((item) => item.businessStatus !== "CLOSED_PERMANENTLY");
  return { providers, attribution: { source: "Google Places", googleLogoRequired: true, transientContent: true } };
}

export async function getHouseholdProviderDestination(placeId: string) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw httpError(400, "A valid Google Place ID is required.", "invalid_place_id");
  const body = await googleRequest(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { method: "GET", headers: { "X-Goog-FieldMask": "id,businessStatus,websiteUri" } });
  if (body.id !== placeId || body.businessStatus === "CLOSED_PERMANENTLY" || typeof body.websiteUri !== "string") throw httpError(409, "This provider does not currently expose an eligible website.", "household_destination_unavailable");
  const decision = validateExternalUrl(body.websiteUri); if (!decision.allowed) throw httpError(502, "The provider website did not pass URL safety checks.", "unsafe_household_destination");
  return decision.url.toString();
}
