import { randomUUID } from "node:crypto";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

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
    const response = await amadeusFetch(`${values.baseUrl}/v1/security/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const payload = await response.json() as { access_token?: string };
    if (!response.ok || !payload.access_token) return { error: fail(input, `Amadeus authentication returned HTTP ${response.status}.`) };
    return { token: payload.access_token, baseUrl: values.baseUrl };
  } catch { return { error: fail(input, "Amadeus authentication could not be reached.") }; }
}
async function get(input: ProviderExecutionInput, path: string, params: Record<string, string>) {
  const auth = await access(input); if (auth.error) return auth;
  const url = new URL(`${auth.baseUrl}${path}`); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  try { const response = await amadeusFetch(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }); const body = await response.json() as Record<string, unknown>; if (!response.ok) return { error: fail(input, `Amadeus returned HTTP ${response.status}.`) }; return { body }; }
  catch { return { error: fail(input, "Amadeus search could not be reached.") }; }
}
async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  if (input.action !== "search") return fail(input, "This Amadeus adapter currently supports discovery only.");
  if (input.capability.key === "travel.flight.search") {
    const { origin, destination, departureDate } = input.input; if (!origin || !destination || !departureDate) return fail(input, "Origin, destination, and departure date are required.");
    const result = await get(input, "/v2/shopping/flight-offers", { originLocationCode: String(origin), destinationLocationCode: String(destination), departureDate: String(departureDate), adults: String(input.input.adults ?? 1), currencyCode: String(input.input.currency ?? "EUR"), max: String(input.input.max ?? 20) });
    if ("error" in result) return result.error; return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", ...(result.body ?? {}) } };
  }
  if (input.capability.key === "travel.hotel.search") {
    const cityCode = input.input.cityCode; if (!cityCode) return fail(input, "City code is required for hotel discovery.");
    const hotels = await get(input, "/v1/reference-data/locations/hotels/by-city", { cityCode: String(cityCode), radius: String(input.input.radius ?? 20), radiusUnit: "KM" });
    if ("error" in hotels) return hotels.error; return { status: "ok", toolRunId: runId(input), result: { provider: "amadeus", ...(hotels.body ?? {}) } };
  }
  return fail(input, "Amadeus does not support this discovery capability.");
}
export const amadeusProvider: ProviderAdapter = { providerId: "amadeus", label: "Amadeus", kind: "api", toolName: "amadeus.travel", capabilities: ["travel.flight.search", "travel.hotel.search"], actions: ["search"], requiresConnectedAccount: true, credentialType: "api_key", credentialFields: [{ key: "clientId", label: "API key", type: "password", required: true }, { key: "clientSecret", label: "API secret", type: "password", required: true }, { key: "baseUrl", label: "API base URL", type: "url", required: false }], authType: "api_key", riskLevel: "low", description: "Amadeus flight offers and hotel discovery.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: "healthy", message: "Amadeus adapter installed; credentials are checked per connection.", checkedAt: new Date().toISOString() }; } };
