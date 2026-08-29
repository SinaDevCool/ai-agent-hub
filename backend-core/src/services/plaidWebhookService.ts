import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { decryptProviderCredentials } from "./cryptoService.js";
import { enqueueDurableJob, registerDurableJobHandler } from "./durableJobService.js";
import { getConnectorCapability } from "./connectorCapabilityService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { finishProviderWebhook, receiveProviderWebhook } from "./providerDeliveryService.js";
import { getProviderConnectionForExecution } from "./providerConnectionService.js";
import { plaidProvider } from "./providers/plaidProvider.js";

type Json = Record<string, unknown>;
type FetchLike = typeof fetch;
let plaidWebhookFetch: FetchLike = fetch;
export function setPlaidWebhookFetchForTest(value: FetchLike) { plaidWebhookFetch = value; }
export function resetPlaidWebhookFetchForTest() { plaidWebhookFetch = fetch; }
const jobSchema = z.object({ webhookEventId: z.string(), eventKey: z.string(), userId: z.string(), connectionId: z.string(), itemId: z.string(), webhookType: z.string(), webhookCode: z.string(), errorCode: z.string().optional() });
const reconcileSchema = jobSchema.pick({ webhookEventId: true, eventKey: true, userId: true, connectionId: true, itemId: true });
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function decodePart(value: string) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Json; }
function safeHashEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function plaidUrl(environment: string) { return environment === "production" ? "https://production.plaid.com" : environment === "development" ? "https://development.plaid.com" : "https://sandbox.plaid.com"; }

export async function acceptPlaidWebhook(input: { rawBody: Buffer; verification?: string; now?: Date }) {
  if (env.LIVE_FINANCE_ENABLED !== "true") return { accepted: false, status: 404 as const, reason: "disabled" };
  let body: Json; try { body = JSON.parse(input.rawBody.toString("utf8")) as Json; } catch { return { accepted: false, status: 400 as const, reason: "invalid_json" }; }
  const itemId = text(body.item_id); if (!itemId || !input.verification) return { accepted: false, status: 401 as const, reason: "missing_verification" };
  const connections = await prisma.providerConnection.findMany({ where: { providerId: "plaid", status: { not: "revoked" } } });
  const connection = connections.find((value) => value.externalAccountId === itemId || text(decodeJson<Json>(value.metadata, {}).itemId) === itemId);
  if (!connection) return { accepted: false, status: 404 as const, reason: "unknown_item" };
  const parts = input.verification.split("."); if (parts.length !== 3) return { accepted: false, status: 401 as const, reason: "invalid_verification" };
  let header: Json; let claims: Json; try { header = decodePart(parts[0]!); claims = decodePart(parts[1]!); } catch { return { accepted: false, status: 401 as const, reason: "invalid_verification" }; }
  if (header.alg !== "ES256" || !text(header.kid)) return { accepted: false, status: 401 as const, reason: "invalid_algorithm" };
  const credentials = decodeJson<Json>(decryptProviderCredentials(connection.encryptedCredentials), {}); const clientId = text(credentials.clientId); const secret = text(credentials.secret); const environment = text(credentials.environment) || "sandbox";
  if (!clientId || !secret) return { accepted: false, status: 503 as const, reason: "verification_unavailable" };
  try {
    const response = await plaidWebhookFetch(`${plaidUrl(environment)}/webhook_verification_key/get`, { method: "POST", signal: globalThis.AbortSignal.timeout(env.FINANCE_PROVIDER_TIMEOUT_MS), headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret }, body: JSON.stringify({ key_id: header.kid }) });
    const keyBody = await response.json() as Json; const jwk = keyBody.key as Json | undefined;
    if (!response.ok || !jwk || jwk.alg !== "ES256" || jwk.kid !== header.kid || (typeof jwk.expired_at === "number" && jwk.expired_at * 1000 <= (input.now ?? new Date()).valueOf())) return { accepted: false, status: 401 as const, reason: "invalid_key" };
    const publicKey = createPublicKey({ key: jwk as never, format: "jwk" }); const signature = Buffer.from(parts[2]!, "base64url");
    if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)) return { accepted: false, status: 401 as const, reason: "invalid_signature" };
  } catch { return { accepted: false, status: 503 as const, reason: "verification_unavailable" }; }
  const issuedAt = Number(claims.iat); const now = input.now ?? new Date(); if (!Number.isFinite(issuedAt) || Math.abs(now.valueOf() - issuedAt * 1000) > 5 * 60_000) return { accepted: false, status: 409 as const, reason: "replay_window" };
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex"); if (!safeHashEqual(bodyHash, text(claims.request_body_sha256))) return { accepted: false, status: 401 as const, reason: "body_hash_mismatch" };
  const webhookType = text(body.webhook_type); const webhookCode = text(body.webhook_code); const eventKey = createHash("sha256").update(input.verification).digest("hex");
  const received = await receiveProviderWebhook({ providerId: "plaid", externalEventId: eventKey, eventType: `${webhookType}:${webhookCode}`, payload: { itemId, webhookType, webhookCode, errorCode: text((body.error && typeof body.error === "object" ? body.error as Json : {}).error_code) || undefined } });
  await enqueueDurableJob({ jobType: "plaid_webhook", dedupeKey: `plaid:${eventKey}`, payload: { webhookEventId: received.event.id, eventKey, userId: connection.userId, connectionId: connection.id, itemId, webhookType, webhookCode, errorCode: text((body.error && typeof body.error === "object" ? body.error as Json : {}).error_code) || undefined }, userId: connection.userId, aggregateType: "plaid_item", aggregateId: itemId, correlationId: eventKey, maxAttempts: 8 });
  return { accepted: true, status: 202 as const, deduplicated: received.duplicate, eventKey };
}

export function registerPlaidJobHandlers() {
  registerDurableJobHandler("plaid_webhook", { version: 1, schema: jobSchema, execute: async ({ payload }) => {
    const event = jobSchema.parse(payload); const connection = await prisma.providerConnection.findFirst({ where: { id: event.connectionId, userId: event.userId, providerId: "plaid" } });
    if (!connection) { await finishProviderWebhook({ id: event.webhookEventId, succeeded: false, failureReason: "Connection correlation no longer exists." }); return { outcome: "permanent", message: "Connection correlation no longer exists." }; }
    const metadata = decodeJson<Json>(connection.metadata, {});
    if (["PENDING_DISCONNECT", "PENDING_EXPIRATION"].includes(event.webhookCode)) await prisma.providerConnection.update({ where: { id: connection.id }, data: { metadata: encodeJson({ ...metadata, consentStatus: "expiring", consentWarningAt: new Date().toISOString() }) } });
    if (["ITEM_LOGIN_REQUIRED", "ACCESS_NOT_GRANTED", "USER_PERMISSION_REVOKED"].includes(event.errorCode ?? event.webhookCode)) await prisma.providerConnection.update({ where: { id: connection.id }, data: { status: "reconnect_required", lastFailureAt: new Date(), lastFailureReason: "Financial institution consent must be renewed." } });
    if (event.webhookType === "TRANSACTIONS" && event.webhookCode === "SYNC_UPDATES_AVAILABLE") await enqueueDurableJob({ jobType: "plaid_reconciliation", dedupeKey: `plaid:reconcile:${event.eventKey}`, payload: { webhookEventId: event.webhookEventId, eventKey: event.eventKey, userId: event.userId, connectionId: event.connectionId, itemId: event.itemId }, userId: event.userId, aggregateType: "plaid_item", aggregateId: event.itemId, correlationId: event.eventKey, maxAttempts: 8 });
    await finishProviderWebhook({ id: event.webhookEventId, succeeded: true }); return { outcome: "succeeded" };
  } });
  registerDurableJobHandler("plaid_reconciliation", { version: 1, schema: reconcileSchema, execute: async ({ payload }) => {
    const event = reconcileSchema.parse(payload); const ready = await getProviderConnectionForExecution({ userId: event.userId, providerId: "plaid", connectionId: event.connectionId }); if (!ready || ready.connection.status !== "active") return { outcome: "retry", classification: "transient", message: "Plaid connection is unavailable for reconciliation.", retryAfterMs: 60_000 };
    const capability = getConnectorCapability("finance.transactions.read"); if (!capability) return { outcome: "permanent", message: "Finance transaction capability is not registered." };
    const result = await plaidProvider.execute({ userId: event.userId, agentId: "system-plaid-reconciliation", capability, action: "sync_status", input: {}, attempt: 1, providerConnection: { id: ready.connection.id, status: ready.connection.status, displayName: ready.connection.displayName, credentials: ready.credentials } });
    if (result.status === "ok") return { outcome: "succeeded" }; if (result.status === "awaiting_human_approval") return { outcome: "permanent", message: "Read-only reconciliation unexpectedly requested approval." }; return result.retryable ? { outcome: "retry", classification: "transient", message: result.userMessage ?? result.reason } : { outcome: "permanent", message: result.userMessage ?? result.reason };
  } });
}
