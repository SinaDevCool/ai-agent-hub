import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
let calFetch: FetchLike = fetch;
export function setCalComFetchForTest(value: FetchLike) { calFetch = value; }
export function resetCalComFetchForTest() { calFetch = fetch; }
const version = "2026-02-25";
function blocked(input: ProviderExecutionInput, reason: string, code: "invalid_input" | "connector_not_connected" | "provider_error" = "invalid_input"): ProviderExecutionResult { return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code, userMessage: reason, nextAction: code === "connector_not_connected" ? "connect_account" : code === "provider_error" ? "try_again" : "add_missing_info", retryable: code === "provider_error" }; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
async function request(input: ProviderExecutionInput, path: string, method: string, body?: unknown) {
  if (env.LIVE_APPOINTMENTS_ENABLED !== "true") return { error: blocked(input, "Live appointments are not enabled in this environment.") };
  const token = text(input.providerConnection?.credentials.accessToken ?? input.providerConnection?.credentials.apiKey);
  if (!token) return { error: blocked(input, "Connect Cal.com before using live appointments.", "connector_not_connected") };
  try {
    const response = await calFetch(`https://api.cal.com/v2${path}`, { method, signal: globalThis.AbortSignal.timeout(env.APPOINTMENTS_PROVIDER_TIMEOUT_MS), headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "cal-api-version": version, ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json() as Record<string, unknown>;
    if (!response.ok || value.status === "error") return { error: blocked(input, `Cal.com returned HTTP ${response.status}.`, "provider_error") };
    return { value };
  } catch { return { error: blocked(input, "Cal.com could not be reached.", "provider_error") }; }
}
async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const toolRunId = input.previousToolRunId ?? randomUUID();
  if (input.capability.key === "appointments.availability.search" && input.action === "search") {
    const start = text(input.input.start); const end = text(input.input.end); const eventTypeId = Number(input.input.eventTypeId);
    if (!start || !end || !Number.isInteger(eventTypeId)) return blocked(input, "Start, end, and event type ID are required.");
    const query = new URLSearchParams({ start, end, eventTypeId: String(eventTypeId), format: "range" });
    const result = await request(input, `/slots?${query}`, "GET"); if (result.error) return result.error;
    return { status: "ok", toolRunId, result: { provider: "cal-com", inventoryMode: "live", fetchedAt: new Date().toISOString(), slots: result.value?.data ?? {} } };
  }
  if (input.capability.key === "appointments.booking.manage" && ["reserve", "execute_action"].includes(input.action)) {
    if (!input.idempotencyKey || !text(input.input.approvalRequestId)) return blocked(input, "Approval reference and idempotency key are required.");
    const start = text(input.input.start); const attendee = input.input.attendee; const eventTypeId = Number(input.input.eventTypeId);
    if (!start || !attendee || typeof attendee !== "object" || !Number.isInteger(eventTypeId)) return blocked(input, "Start, attendee, and event type ID are required.");
    const result = await request(input, "/bookings", "POST", { start, attendee, eventTypeId, metadata: { agentHubApproval: text(input.input.approvalRequestId) } }); if (result.error) return result.error;
    return { status: "ok", toolRunId, actionName: "Cal.com appointment created", result: { provider: "cal-com", booking: result.value?.data } };
  }
  const uid = encodeURIComponent(text(input.input.bookingUid)); if (!uid) return blocked(input, "Booking UID is required.");
  if (["status", "sync_status"].includes(input.action)) { const result = await request(input, `/bookings/${uid}`, "GET"); if (result.error) return result.error; return { status: "ok", toolRunId, result: { provider: "cal-com", booking: result.value?.data } }; }
  if (input.action === "cancel") { if (!text(input.input.approvalRequestId)) return blocked(input, "Approval reference is required for cancellation."); const result = await request(input, `/bookings/${uid}/cancel`, "POST", { cancellationReason: text(input.input.reason) || "User requested cancellation" }); if (result.error) return result.error; return { status: "ok", toolRunId, actionName: "Cal.com appointment cancelled", result: { provider: "cal-com", booking: result.value?.data } }; }
  return blocked(input, "Cal.com does not support this appointment operation.");
}
export const calComProvider: ProviderAdapter = { providerId: "cal-com", label: "Cal.com", kind: "api", toolName: "cal.appointments", capabilities: ["appointments.availability.search", "appointments.booking.manage"], actions: ["search", "reserve", "execute_action", "status", "sync_status", "cancel"], requiresConnectedAccount: true, credentialType: "bearer_token", credentialFields: [{ key: "accessToken", label: "Cal.com API key or OAuth token", type: "password", required: true }], authType: "api_key", riskLevel: "high", description: "Gated Cal.com availability and appointment lifecycle adapter.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: env.LIVE_APPOINTMENTS_ENABLED === "true" ? "healthy" : "disabled", message: env.LIVE_APPOINTMENTS_ENABLED === "true" ? "Cal.com adapter is enabled; connection health is checked per account." : "Live appointments are disabled.", checkedAt: new Date().toISOString() }; } };
