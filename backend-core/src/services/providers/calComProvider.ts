import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
let calFetch: FetchLike = fetch;
export function setCalComFetchForTest(value: FetchLike) { calFetch = value; }
export function resetCalComFetchForTest() { calFetch = fetch; }
const version = "2026-02-25";
// The environment kill switch is checked again for every outbound Cal.com request.
function blocked(input: ProviderExecutionInput, reason: string, code: "invalid_input" | "connector_not_connected" | "provider_error" = "invalid_input"): ProviderExecutionResult { return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code, userMessage: reason, nextAction: code === "connector_not_connected" ? "connect_account" : code === "provider_error" ? "try_again" : "add_missing_info", retryable: code === "provider_error" }; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
async function request(input: ProviderExecutionInput, path: string, method: string, body?: unknown, apiVersion = version) {
  if (env.LIVE_APPOINTMENTS_ENABLED !== "true") return { error: blocked(input, "Live appointments are not enabled in this environment.") };
  const token = text(input.providerConnection?.credentials.accessToken ?? input.providerConnection?.credentials.apiKey);
  if (!token) return { error: blocked(input, "Connect Cal.com before using live appointments.", "connector_not_connected") };
  try {
    const response = await calFetch(`https://api.cal.com/v2${path}`, { method, signal: globalThis.AbortSignal.timeout(env.APPOINTMENTS_PROVIDER_TIMEOUT_MS), headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "cal-api-version": apiVersion, ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json() as Record<string, unknown>;
    if (!response.ok || value.status === "error") return { error: blocked(input, `Cal.com returned HTTP ${response.status}.`, "provider_error") };
    return { value };
  } catch { return { error: blocked(input, "Cal.com could not be reached.", "provider_error") }; }
}
async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const toolRunId = input.previousToolRunId ?? randomUUID();
  if (input.capability.key === "appointments.availability.search" && input.action === "search") {
    const start = text(input.input.start ?? input.input.startDate); const end = text(input.input.end ?? input.input.endDate);
    let eventTypeId = Number(input.input.eventTypeId);
    let eventType: Record<string, unknown> | undefined;
    if (!start || !end) return blocked(input, "Start and end dates are required.");
    if (!Number.isInteger(eventTypeId)) {
      const eventTypesResult = await request(input, "/event-types?sortCreatedAt=asc", "GET", undefined, "2024-06-14");
      if (eventTypesResult.error) return eventTypesResult.error;
      const eventTypes = Array.isArray(eventTypesResult.value?.data) ? eventTypesResult.value.data : [];
      eventType = eventTypes.find((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === "object" && Number.isInteger(Number((candidate as Record<string, unknown>).id)));
      eventTypeId = Number(eventType?.id);
      if (!Number.isInteger(eventTypeId)) return blocked(input, "Create at least one Cal.com event type before searching availability.");
    }
    const query = new URLSearchParams({ start, end, eventTypeId: String(eventTypeId), format: "range" });
    const result = await request(input, `/slots?${query}`, "GET", undefined, "2024-09-04"); if (result.error) return result.error;
    return { status: "ok", toolRunId, result: { provider: "cal-com", inventoryMode: "live", fetchedAt: new Date().toISOString(), eventType: eventType ? { id: eventTypeId, title: text(eventType.title), slug: text(eventType.slug) } : { id: eventTypeId }, slots: result.value?.data ?? {} } };
  }
  if (input.capability.key === "appointments.booking.manage" && ["reserve", "execute_action"].includes(input.action)) {
    if (!input.idempotencyKey || !text(input.input.approvalRequestId)) return blocked(input, "Approval reference and idempotency key are required.");
    if (text(input.input.bookingUid)) {
      const validatedAt = new Date(text(input.input.slotValidatedAt)); const start = text(input.input.newStart);
      if (!start || Number.isNaN(validatedAt.valueOf()) || Math.abs(Date.now() - validatedAt.valueOf()) > 5 * 60_000) return blocked(input, "Choose a freshly checked slot before rescheduling.");
      const uid = encodeURIComponent(text(input.input.bookingUid));
      const result = await request(input, `/bookings/${uid}/reschedule`, "POST", { start, reschedulingReason: text(input.input.reason) || "User requested reschedule" }); if (result.error) return result.error;
      await syncBooking(input, result.value?.data, "rescheduled");
      return { status: "ok", toolRunId, actionName: "Cal.com appointment rescheduled", result: { provider: "cal-com", booking: result.value?.data } };
    }
    const start = text(input.input.start); const attendee = input.input.attendee; const eventTypeId = Number(input.input.eventTypeId);
    if (!start || !attendee || typeof attendee !== "object" || !Number.isInteger(eventTypeId)) return blocked(input, "Start, attendee, and event type ID are required.");
    const result = await request(input, "/bookings", "POST", { start, attendee, eventTypeId, metadata: { agentHubApproval: text(input.input.approvalRequestId), agentHubUserId: input.userId, agentHubIdempotencyKey: input.idempotencyKey } }); if (result.error) return result.error;
    await syncBooking(input, result.value?.data, "confirmed");
    return { status: "ok", toolRunId, actionName: "Cal.com appointment created", result: { provider: "cal-com", booking: result.value?.data } };
  }
  const uid = encodeURIComponent(text(input.input.bookingUid)); if (!uid) return blocked(input, "Booking UID is required.");
  if (["status", "sync_status"].includes(input.action)) { const result = await request(input, `/bookings/${uid}`, "GET"); if (result.error) return result.error; return { status: "ok", toolRunId, result: { provider: "cal-com", booking: result.value?.data } }; }
  if (input.action === "cancel") { if (!text(input.input.approvalRequestId) || !input.idempotencyKey) return blocked(input, "Approval reference and idempotency key are required for cancellation."); const result = await request(input, `/bookings/${uid}/cancel`, "POST", { cancellationReason: text(input.input.reason) || "User requested cancellation" }); if (result.error) return result.error; await syncBooking(input, result.value?.data, "cancelled"); return { status: "ok", toolRunId, actionName: "Cal.com appointment cancelled", result: { provider: "cal-com", booking: result.value?.data } }; }
  return blocked(input, "Cal.com does not support this appointment operation.");
}

async function syncBooking(input: ProviderExecutionInput, raw: unknown, fallbackStatus: string) {
  if (!raw || typeof raw !== "object" || !input.idempotencyKey) return;
  const booking = raw as Record<string, unknown>; const uid = text(booking.uid) || text(input.input.bookingUid); if (!uid) return;
  const priorUid = text(input.input.bookingUid);
  const existingAppointment = priorUid ? await prisma.appointment.findFirst({ where: { userId: input.userId, externalProviderId: priorUid } }) : null;
  const start = new Date(text(booking.start) || text(input.input.start) || text(input.input.newStart));
  const explicitEnd = text(booking.end);
  const end = explicitEnd ? new Date(explicitEnd) : Number.isNaN(start.valueOf()) ? new Date(Number.NaN) : new Date(start.valueOf() + Number(booking.duration ?? 30) * 60_000);
  const validTimes = !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf());
  if (existingAppointment) await prisma.appointment.update({ where: { id: existingAppointment.id }, data: { externalProviderId: uid, status: text(booking.status) || fallbackStatus, confirmationCode: uid, ...(validTimes ? { startsAt: start, endsAt: end } : {}) } });
  else {
    if (!validTimes) return;
    await prisma.appointment.upsert({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } }, update: { externalProviderId: uid, startsAt: start, endsAt: end, status: text(booking.status) || fallbackStatus }, create: { userId: input.userId, providerId: "cal-com", externalProviderId: uid, providerName: text(booking.title) || "Cal.com appointment", specialty: text(booking.title) || "Appointment", location: text(booking.location) || "To be confirmed", startsAt: start, endsAt: end, timeZone: text((input.input.attendee as Record<string, unknown> | undefined)?.timeZone) || "UTC", status: text(booking.status) || fallbackStatus, confirmationCode: uid, idempotencyKey: input.idempotencyKey } });
  }
  const lifeData = { providerId: "cal-com", state: fallbackStatus === "cancelled" ? "cancelled" : "confirmed", externalReference: uid, resultJson: JSON.stringify({ provider: "cal-com", bookingUid: uid, status: text(booking.status) || fallbackStatus }), completedAt: new Date() };
  const updatedLife = priorUid ? await prisma.lifeTransaction.updateMany({ where: { userId: input.userId, externalReference: priorUid }, data: lifeData }) : { count: 0 };
  if (!updatedLife.count) await prisma.lifeTransaction.upsert({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } }, update: lifeData, create: { userId: input.userId, capabilityKey: "appointments.booking.manage", executionLevel: "transact", ...lifeData, approvalRequired: true, idempotencyKey: input.idempotencyKey, inputJson: JSON.stringify({ appointment: true }) } });
}
export const calComProvider: ProviderAdapter = { providerId: "cal-com", label: "Cal.com", kind: "api", toolName: "cal.appointments", capabilities: ["appointments.availability.search", "appointments.booking.manage"], actions: ["search", "reserve", "execute_action", "status", "sync_status", "cancel"], requiresConnectedAccount: true, credentialType: "bearer_token", credentialFields: [{ key: "accessToken", label: "Cal.com API v2 key", type: "password", required: true, helpText: "Create this in Cal.com under Settings → Developer → API Keys. It is encrypted and never returned to the browser." }], runtimeConfig: { healthEndpointUrl: "https://api.cal.com/v2/me", healthMethod: "GET", headers: { "cal-api-version": version }, timeoutMs: 8000 }, authType: "api_key", riskLevel: "high", description: "Gated Cal.com availability and appointment lifecycle adapter.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: env.LIVE_APPOINTMENTS_ENABLED === "true" ? "healthy" : "disabled", message: env.LIVE_APPOINTMENTS_ENABLED === "true" ? "Cal.com adapter is enabled; connection health is checked per account." : "Live appointments are disabled.", checkedAt: new Date().toISOString() }; } };
