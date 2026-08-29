import { randomUUID } from "node:crypto";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
let duffelFetch: FetchLike = fetch;
export function setDuffelFetchForTest(value: FetchLike) { duffelFetch = value; }
export function resetDuffelFetchForTest() { duffelFetch = fetch; }

function token(input: ProviderExecutionInput) {
  const value = input.providerConnection?.credentials.accessToken ?? input.providerConnection?.credentials.apiKey;
  return typeof value === "string" ? value.trim() : "";
}
function blocked(input: ProviderExecutionInput, reason: string, code: "invalid_input" | "connector_not_connected" | "provider_error" = "invalid_input"): ProviderExecutionResult {
  return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code, userMessage: reason, nextAction: code === "connector_not_connected" ? "connect_account" : code === "provider_error" ? "try_again" : "add_missing_info", retryable: code === "provider_error" };
}
async function request(input: ProviderExecutionInput, path: string, method: string, data?: unknown) {
  const accessToken = token(input);
  if (!accessToken) return { error: blocked(input, "Connect a Duffel access token before using live travel.", "connector_not_connected") };
  try {
    const response = await duffelFetch(`https://api.duffel.com${path}`, { method, headers: { Accept: "application/json", "Content-Type": "application/json", "Duffel-Version": "v2", Authorization: `Bearer ${accessToken}`, ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) }, body: data === undefined ? undefined : JSON.stringify({ data }) });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) return { error: blocked(input, `Duffel returned HTTP ${response.status}.`, "provider_error") };
    return { body };
  } catch {
    return { error: blocked(input, "Duffel could not be reached.", "provider_error") };
  }
}

async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const toolRunId = input.previousToolRunId ?? randomUUID();
  if (input.capability.key === "travel.flight.search" && input.action === "search") {
    const { origin, destination, departureDate, passengers = [{ type: "adult" }], cabinClass = "economy" } = input.input;
    if (!origin || !destination || !departureDate) return blocked(input, "Origin, destination, and departure date are required.");
    const result = await request(input, "/air/offer_requests?return_offers=true", "POST", { slices: [{ origin, destination, departure_date: departureDate }], passengers, cabin_class: cabinClass });
    if (result.error) return result.error;
    return { status: "ok", toolRunId, result: { provider: "duffel", ...(result.body ?? {}) } };
  }
  if (input.capability.key === "travel.flight.book" && ["reserve", "execute_action"].includes(input.action)) {
    const { offerId, passengers, approvalRequestId, services = [], type = "instant", payments = [] } = input.input;
    if (!offerId || !Array.isArray(passengers) || !passengers.length || !approvalRequestId) return blocked(input, "Offer, passengers, and approval reference are required.");
    if (!input.idempotencyKey) return blocked(input, "An idempotency key is required for booking.");
    const result = await request(input, "/air/orders", "POST", { type, selected_offers: [offerId], passengers, services, ...(type === "instant" ? { payments } : {}) });
    if (result.error) return result.error;
    return { status: "ok", toolRunId, actionName: "Duffel flight order created", result: { provider: "duffel", ...(result.body ?? {}) } };
  }
  if (input.capability.key === "travel.flight.book" && ["status", "sync_status"].includes(input.action)) {
    if (!input.input.orderId) return blocked(input, "Order ID is required.");
    const result = await request(input, `/air/orders/${encodeURIComponent(String(input.input.orderId))}`, "GET");
    if (result.error) return result.error;
    return { status: "ok", toolRunId, result: { provider: "duffel", ...(result.body ?? {}) } };
  }
  if (input.capability.key === "travel.flight.book" && input.action === "cancel") {
    if (!input.input.orderId || !input.input.approvalRequestId) return blocked(input, "Order ID and approval reference are required.");
    const quote = await request(input, "/air/order_cancellations", "POST", { order_id: input.input.orderId });
    if (quote.error) return quote.error;
    const cancellation = (quote.body?.data ?? {}) as Record<string, unknown>;
    if (input.input.confirm !== true) return { status: "ok", toolRunId, result: { provider: "duffel", cancellationQuote: cancellation, confirmationRequired: true } };
    const cancellationId = cancellation.id;
    if (!cancellationId) return blocked(input, "Duffel did not return a cancellation quote identifier.", "provider_error");
    const confirmed = await request(input, `/air/order_cancellations/${encodeURIComponent(String(cancellationId))}/actions/confirm`, "POST");
    if (confirmed.error) return confirmed.error;
    return { status: "ok", toolRunId, actionName: "Duffel flight order cancelled", result: { provider: "duffel", ...(confirmed.body ?? {}) } };
  }
  return blocked(input, "Duffel does not support this operation through the configured adapter.");
}

export const duffelProvider: ProviderAdapter = {
  providerId: "duffel", label: "Duffel", kind: "api", toolName: "duffel.travel", capabilities: ["travel.flight.search", "travel.flight.book"], actions: ["search", "reserve", "execute_action", "status", "sync_status", "cancel"], requiresConnectedAccount: true, credentialType: "api_key", credentialFields: [{ key: "accessToken", label: "Duffel access token", type: "password", required: true }], authType: "api_key", riskLevel: "high", description: "Duffel flight offers, orders, status, and supported cancellations.", supportsHealthCheck: true,
  canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute,
  async healthCheck() { return { state: "healthy", message: "Duffel adapter is installed; connection health is checked per account.", checkedAt: new Date().toISOString() }; }
};
