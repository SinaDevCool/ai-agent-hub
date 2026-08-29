import { randomUUID } from "node:crypto";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";
import { env } from "../../config/env.js";
import { normalizeAmadeusFlightOffers, normalizeAmadeusHotelOffers, validateFlightSearchInput, validateHotelSearchInput } from "../travelOfferService.js";

type FetchLike = typeof fetch;
let amadeusFetch: FetchLike = fetch;
export function setAmadeusFetchForTest(value: FetchLike) { amadeusFetch = value; }
export function resetAmadeusFetchForTest() { amadeusFetch = fetch; }
function runId(input: ProviderExecutionInput) { return input.previousToolRunId ?? randomUUID(); }
function fail(input: ProviderExecutionInput, reason: string, connected = true): ProviderExecutionResult { return { status: "blocked", toolRunId: runId(input), reason, code: connected ? "provider_error" : "connector_not_connected", userMessage: reason, nextAction: connected ? "try_again" : "connect_account", retryable: connected }; }
function credentials(input: ProviderExecutionInput) { const values = input.providerConnection?.credentials ?? {}; return { clientId: String(values.clientId ?? "").trim(), clientSecret: String(values.clientSecret ?? "").trim(), baseUrl: String(values.baseUrl ?? "https://test.api.amadeus.com").replace(/\/$/, "") }; }
async function access(input: ProviderExecutionInput) {
  const values = credentials(input);
  if (!values.clientId || !values.clientSecret) return { error: fail(input, "Connect Amadeus client credentials before searching live inventory.", false) };
  try {
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: values.clientId, client_secret: values.clientSecret });
    const response = await amadeusFetch(`${values.baseUrl}/v1/security/oauth2/token`, { method: "POST", signal: globalThis.AbortSignal.timeout(env.TRAVEL_PROVIDER_TIMEOUT_MS), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const payload = await response.json() as { access_token?: string };
    if (!response.ok || !payload.access_token) return { error: fail(input, `Amadeus authentication returned HTTP ${response.status}.`) };
    return { token: payload.access_token, baseUrl: values.baseUrl };
  } catch { return { error: fail(input, "Amadeus authentication could not be reached.") }; }
}
async function get(input: ProviderExecutionInput, path: string, params: Record<string, string>) {
  const auth = await access(input); if (auth.error) return auth;
  const url = new URL(`${auth.baseUrl}${path}`); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  try { const response = await amadeusFetch(url, { signal: globalThis.AbortSignal.timeout(env.TRAVEL_PROVIDER_TIMEOUT_MS), headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }); const body = await response.json() as Record<string, unknown>; if (!response.ok) return { error: fail(input, `Amadeus returned HTTP ${response.status}.`) }; return { body }; }
  catch { return { error: fail(input, "Amadeus search could not be reached.") }; }
}
async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  if (input.action !== "search") return fail(input, "This Amadeus adapter currently supports discovery only.");
  const configured = credentials(input); if (!configured.clientId || !configured.clientSecret) return fail(input, "Connect Amadeus client credentials before searching live inventory.", false);
  if (input.capability.key === "travel.flight.search") {
    let search: ReturnType<typeof validateFlightSearchInput>; try { search = validateFlightSearchInput(input.input); } catch (error) { return fail(input, error instanceof Error ? error.message : "Travel search details are invalid."); }
    const result = await get(input, "/v2/shopping/flight-offers", { originLocationCode: search.origin, destinationLocationCode: search.destination, departureDate: search.departureDate, ...(search.returnDate ? { returnDate: search.returnDate } : {}), adults: String(search.adults), currencyCode: search.currency, max: String(search.max), travelClass: search.cabinClass.toUpperCase() });
    if ("error" in result) return result.error; const offers = normalizeAmadeusFlightOffers(result.body ?? {}); return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", inventoryMode: "live", contractVersion: "travel-offer.v1", offers, partial: offers.length < (Array.isArray(result.body?.data) ? result.body.data.length : 0), fetchedAt: new Date().toISOString() } };
  }
  if (input.capability.key === "travel.hotel.search") {
    const selectedOfferId = String(input.input.offerId ?? input.input.selectedOfferId ?? "").trim();
    if (selectedOfferId) {
      if (!/^[A-Za-z0-9_-]{5,200}$/.test(selectedOfferId)) return fail(input, "The selected Amadeus hotel offer id is invalid.");
      const adults = Number(input.input.adults ?? 1); const rooms = Number(input.input.rooms ?? 1); const currency = String(input.input.currency ?? "EUR").toUpperCase();
      const refreshed = await get(input, `/v3/shopping/hotel-offers/${encodeURIComponent(selectedOfferId)}`, {});
      if ("error" in refreshed) return refreshed.error;
      const offers = normalizeAmadeusHotelOffers(refreshed.body ?? {}, { adults, rooms, currency, max: 1 }, new Date(), true);
      if (!offers.length) return fail(input, "The selected Amadeus hotel offer is no longer available.");
      return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", inventoryMode: "live", contractVersion: "travel-offer.v1", offers, partial: false, selectedOfferRevalidated: true, hostedCheckoutAvailable: false, nativeBookingEnabled: false, fetchedAt: new Date().toISOString() } };
    }
    let search: ReturnType<typeof validateHotelSearchInput>; try { search = validateHotelSearchInput(input.input); } catch (error) { return fail(input, error instanceof Error ? error.message : "Hotel search details are invalid."); }
    const hotels = await get(input, "/v1/reference-data/locations/hotels/by-city", { cityCode: search.cityCode, radius: String(search.radius), radiusUnit: "KM", hotelSource: "ALL" });
    if ("error" in hotels) return hotels.error;
    const hotelIds = (Array.isArray(hotels.body?.data) ? hotels.body.data : []).map((item) => String((item as Record<string, unknown>).hotelId ?? "")).filter(Boolean).slice(0, 20);
    if (!hotelIds.length) return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", inventoryMode: "live", contractVersion: "travel-offer.v1", offers: [], partial: false, hostedCheckoutAvailable: false, nativeBookingEnabled: false, fetchedAt: new Date().toISOString() } };
    const availability = await get(input, "/v3/shopping/hotel-offers", { hotelIds: hotelIds.join(","), adults: String(search.adults), checkInDate: search.checkInDate, checkOutDate: search.checkOutDate, roomQuantity: String(search.rooms), currency: search.currency, bestRateOnly: "true" });
    if ("error" in availability) return availability.error;
    const offers = normalizeAmadeusHotelOffers(availability.body ?? {}, search);
    return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", inventoryMode: "live", contractVersion: "travel-offer.v1", offers, partial: offers.length < (Array.isArray(availability.body?.data) ? availability.body.data.length : 0), selectedOfferRevalidated: false, hostedCheckoutAvailable: false, nativeBookingEnabled: false, bookingLimitation: "Amadeus Self-Service hotel booking is a native API flow; no customer hosted-checkout URL is provided.", fetchedAt: new Date().toISOString() } };
  }
  return fail(input, "Amadeus does not support this discovery capability.");
}
export const amadeusProvider: ProviderAdapter = { providerId: "amadeus", label: "Amadeus", kind: "api", toolName: "amadeus.travel", capabilities: ["travel.flight.search", "travel.hotel.search"], actions: ["search"], requiresConnectedAccount: true, credentialType: "api_key", credentialFields: [{ key: "clientId", label: "API key", type: "password", required: true }, { key: "clientSecret", label: "API secret", type: "password", required: true }, { key: "baseUrl", label: "API base URL", type: "url", required: false }], authType: "api_key", riskLevel: "low", description: "Amadeus flight offers and hotel discovery.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: "healthy", message: "Amadeus adapter installed; credentials are checked per connection.", checkedAt: new Date().toISOString() }; } };
