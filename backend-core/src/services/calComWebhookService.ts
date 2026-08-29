import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { getConnectorCapability } from "./connectorCapabilityService.js";
import { enqueueDurableJob, registerDurableJobHandler } from "./durableJobService.js";
import { getProviderConnectionForExecution } from "./providerConnectionService.js";
import { calComProvider } from "./providers/calComProvider.js";

const events = new Set(["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED", "BOOKING_REJECTED", "BOOKING_REQUESTED"]);
const jobSchema = z.object({ eventKey: z.string(), eventType: z.string(), userId: z.string(), bookingUid: z.string(), idempotencyKey: z.string(), start: z.string().optional(), end: z.string().optional(), status: z.string() });
const reconciliationSchema = jobSchema.pick({ eventKey: true, userId: true, bookingUid: true, idempotencyKey: true });
function safeEqual(left: string, right: string) { const a = Buffer.from(left.toLowerCase()); const b = Buffer.from(right.toLowerCase()); return a.length === b.length && timingSafeEqual(a, b); }

export async function acceptCalComWebhook(input: { rawBody: Buffer; signature?: string; webhookVersion?: string; now?: Date }) {
  if (env.LIVE_APPOINTMENTS_ENABLED !== "true" || !env.CALCOM_WEBHOOK_SECRET) return { accepted: false, status: 404 as const, reason: "disabled" };
  const expected = createHmac("sha256", env.CALCOM_WEBHOOK_SECRET).update(input.rawBody).digest("hex");
  if (!input.signature || !safeEqual(expected, input.signature)) return { accepted: false, status: 401 as const, reason: "invalid_signature" };
  let body: Record<string, unknown>; try { body = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>; } catch { return { accepted: false, status: 400 as const, reason: "invalid_json" }; }
  const eventType = String(body.triggerEvent ?? ""); if (!events.has(eventType)) return { accepted: true, status: 202 as const, ignored: true };
  const createdAt = new Date(String(body.createdAt ?? "")); const now = input.now ?? new Date();
  if (Number.isNaN(createdAt.valueOf()) || Math.abs(now.valueOf() - createdAt.valueOf()) > env.CALCOM_WEBHOOK_REPLAY_MINUTES * 60_000) return { accepted: false, status: 409 as const, reason: "replay_window" };
  const payload = (body.payload && typeof body.payload === "object" ? body.payload : body) as Record<string, unknown>;
  const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata as Record<string, unknown> : {};
  const bookingUid = String(payload.uid ?? ""); const userId = String(metadata.agentHubUserId ?? ""); const idempotencyKey = String(metadata.agentHubIdempotencyKey ?? `calcom-webhook:${bookingUid}`);
  if (!bookingUid || !userId) return { accepted: false, status: 422 as const, reason: "missing_correlation" };
  const status = eventType === "BOOKING_CANCELLED" || eventType === "BOOKING_REJECTED" ? "cancelled" : eventType === "BOOKING_REQUESTED" ? "requested" : "confirmed";
  const eventKey = createHash("sha256").update(input.rawBody).digest("hex");
  const result = await enqueueDurableJob({ jobType: "calcom_webhook", dedupeKey: `calcom:${eventKey}`, payload: { eventKey, eventType, userId, bookingUid, idempotencyKey, start: payload.startTime ?? payload.start, end: payload.endTime ?? payload.end, status }, userId, aggregateType: "calcom_booking", aggregateId: bookingUid, correlationId: eventKey, maxAttempts: 8 });
  return { accepted: true, status: 202 as const, deduplicated: result.deduplicated, eventKey };
}

export function registerCalComWebhookJobHandler() {
  registerDurableJobHandler("calcom_webhook", { version: 1, schema: jobSchema, execute: async ({ payload }) => {
    const event = jobSchema.parse(payload); const user = await prisma.user.findUnique({ where: { id: event.userId }, select: { id: true } });
    if (!user) return { outcome: "permanent", message: "Webhook user correlation is invalid." };
    const start = event.start ? new Date(event.start) : null; const end = event.end ? new Date(event.end) : null;
    const existing = await prisma.appointment.findFirst({ where: { userId: event.userId, OR: [{ externalProviderId: event.bookingUid }, { idempotencyKey: event.idempotencyKey }] } });
    await enqueueDurableJob({ jobType: "calcom_reconciliation", dedupeKey: `calcom:reconcile:${event.eventKey}`, payload: { eventKey: event.eventKey, userId: event.userId, bookingUid: event.bookingUid, idempotencyKey: event.idempotencyKey }, userId: event.userId, aggregateType: "calcom_booking", aggregateId: event.bookingUid, correlationId: event.eventKey, scheduledAt: new Date(Date.now() + 5_000), maxAttempts: 8 });
    if (!existing) return { outcome: "succeeded" };
    await prisma.appointment.update({ where: { id: existing.id }, data: { externalProviderId: event.bookingUid, status: event.status, ...(start && !Number.isNaN(start.valueOf()) ? { startsAt: start } : {}), ...(end && !Number.isNaN(end.valueOf()) ? { endsAt: end } : {}) } });
    await prisma.lifeTransaction.updateMany({ where: { userId: event.userId, OR: [{ externalReference: event.bookingUid }, { idempotencyKey: event.idempotencyKey }] }, data: { state: event.status === "cancelled" ? "cancelled" : "confirmed", externalReference: event.bookingUid, resultJson: JSON.stringify({ provider: "cal-com", bookingUid: event.bookingUid, status: event.status }), completedAt: new Date() } });
    return { outcome: "succeeded" };
  } });
  registerDurableJobHandler("calcom_reconciliation", { version: 1, schema: reconciliationSchema, execute: async ({ payload }) => {
    const event = reconciliationSchema.parse(payload);
    const appointment = await prisma.appointment.findFirst({ where: { userId: event.userId, OR: [{ externalProviderId: event.bookingUid }, { idempotencyKey: event.idempotencyKey }] } });
    if (!appointment) return { outcome: "retry", classification: "transient", message: "Booking correlation is not persisted yet.", retryAfterMs: 15_000 };
    const connection = await getProviderConnectionForExecution({ userId: event.userId, providerId: "cal-com" });
    if (!connection || connection.connection.status !== "active") return { outcome: "retry", classification: "transient", message: "Cal.com connection is unavailable for reconciliation.", retryAfterMs: 60_000 };
    const capability = getConnectorCapability("appointments.booking.manage");
    if (!capability) return { outcome: "permanent", message: "Appointment capability is not registered." };
    const result = await calComProvider.execute({ userId: event.userId, agentId: "system-calcom-reconciliation", capability, action: "sync_status", input: { bookingUid: event.bookingUid }, idempotencyKey: `calcom-reconcile:${event.eventKey}`, attempt: 1, providerConnection: { id: connection.connection.id, status: connection.connection.status, displayName: connection.connection.displayName, credentials: connection.credentials } });
    if (result.status === "awaiting_human_approval") return { outcome: "permanent", message: "Reconciliation unexpectedly requested human approval." };
    if (result.status === "blocked") return result.retryable ? { outcome: "retry", classification: "transient", message: result.userMessage ?? result.reason } : { outcome: "permanent", message: result.userMessage ?? result.reason };
    const booking = result.result?.booking;
    if (!booking || typeof booking !== "object") return { outcome: "retry", classification: "transient", message: "Cal.com returned no authoritative booking state." };
    const value = booking as Record<string, unknown>;
    const providerUid = String(value.uid ?? event.bookingUid); const providerStatus = String(value.status ?? appointment.status).toLowerCase();
    const start = new Date(String(value.start ?? appointment.startsAt.toISOString())); const end = new Date(String(value.end ?? appointment.endsAt.toISOString()));
    await prisma.appointment.update({ where: { id: appointment.id }, data: { externalProviderId: providerUid, status: providerStatus, ...(!Number.isNaN(start.valueOf()) ? { startsAt: start } : {}), ...(!Number.isNaN(end.valueOf()) ? { endsAt: end } : {}) } });
    await prisma.lifeTransaction.updateMany({ where: { userId: event.userId, OR: [{ externalReference: event.bookingUid }, { idempotencyKey: event.idempotencyKey }] }, data: { externalReference: providerUid, state: ["cancelled", "canceled", "rejected"].includes(providerStatus) ? "cancelled" : "confirmed", resultJson: JSON.stringify({ provider: "cal-com", bookingUid: providerUid, status: providerStatus, reconciled: true }), completedAt: new Date() } });
    return { outcome: "succeeded" };
  } });
}
