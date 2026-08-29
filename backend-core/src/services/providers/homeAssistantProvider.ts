import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { encodeJson } from "../jsonService.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
type EntityState = { entity_id?: unknown; state?: unknown; attributes?: unknown; last_changed?: unknown; last_updated?: unknown };
type ReadyConnection = { baseUrl: string; accessToken: string; entityAllowlist: Set<string> };
type ConnectionResult = ReadyConnection | { error: ProviderExecutionResult };
type RequestResult = { value: unknown; ready: ReadyConnection } | { error: ProviderExecutionResult; uncertain: boolean };
let homeAssistantFetch: FetchLike = fetch;
export function setHomeAssistantFetchForTest(value: FetchLike) { homeAssistantFetch = value; }
export function resetHomeAssistantFetchForTest() { homeAssistantFetch = fetch; }

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function blocked(input: ProviderExecutionInput, reason: string, options: { code?: "invalid_input" | "connector_not_connected" | "provider_error"; retryable?: boolean; nextAction?: "connect_account" | "add_missing_info" | "try_again" | "contact_support" } = {}): ProviderExecutionResult {
  const code = options.code ?? "invalid_input";
  return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code, userMessage: reason, retryable: options.retryable ?? false, nextAction: options.nextAction ?? (code === "connector_not_connected" ? "connect_account" : code === "provider_error" ? "try_again" : "add_missing_info") };
}
function allowedOrigins() { return new Set(env.HOME_ASSISTANT_ALLOWED_ORIGINS.split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean)); }
function connection(input: ProviderExecutionInput): ConnectionResult {
  const credentials = input.providerConnection?.credentials ?? {};
  const accessToken = text(credentials.accessToken);
  const rawBaseUrl = text(credentials.baseUrl).replace(/\/$/, "");
  const entityAllowlist = new Set(text(credentials.entityAllowlist).split(",").map((value) => value.trim()).filter((value) => /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(value)));
  if (!accessToken || !rawBaseUrl || !entityAllowlist.size) return { error: blocked(input, "Connect Home Assistant with a base URL, long-lived access token, and explicit entity allowlist.", { code: "connector_not_connected" }) };
  try {
    const url = new URL(rawBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !allowedOrigins().has(url.origin)) return { error: blocked(input, "This Home Assistant origin is not in the operator allowlist.", { code: "connector_not_connected" }) };
    return { baseUrl: url.origin, accessToken, entityAllowlist };
  } catch { return { error: blocked(input, "Home Assistant base URL is invalid.", { code: "connector_not_connected" }) }; }
}
function safeEntity(raw: EntityState) {
  const attributes = raw.attributes && typeof raw.attributes === "object" ? raw.attributes as Record<string, unknown> : {};
  return { entityId: text(raw.entity_id), state: text(raw.state), name: text(attributes.friendly_name) || text(raw.entity_id), unit: text(attributes.unit_of_measurement) || undefined, lastChanged: text(raw.last_changed) || undefined, lastUpdated: text(raw.last_updated) || undefined };
}
async function request(input: ProviderExecutionInput, path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<RequestResult> {
  const ready = connection(input); if ("error" in ready) return { ...ready, uncertain: false };
  try {
    const response = await homeAssistantFetch(`${ready.baseUrl}${path}`, { method, redirect: "error", signal: globalThis.AbortSignal.timeout(env.SMART_HOME_PROVIDER_TIMEOUT_MS), headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${ready.accessToken}` }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) return { error: blocked(input, response.status === 401 ? "Reconnect Home Assistant; the access token was rejected." : `Home Assistant returned HTTP ${response.status}.`, { code: response.status === 401 ? "connector_not_connected" : "provider_error", retryable: method === "GET" }), uncertain: false };
    return { value: await response.json() as unknown, ready };
  } catch { return { error: blocked(input, method === "POST" ? "The Home Assistant command outcome is uncertain. Do not repeat it; inspect the device state and reconcile this action." : "Home Assistant could not be reached.", { code: "provider_error", retryable: method === "GET", nextAction: method === "POST" ? "contact_support" : "try_again" }), uncertain: method === "POST" };
  }
}
function command(input: ProviderExecutionInput, entityId: string) {
  const domain = entityId.split(".")[0]; const name = text(input.input.command);
  if ((domain === "light" || domain === "switch") && (name === "turn_on" || name === "turn_off")) return { domain, service: name, data: { entity_id: entityId } };
  if (domain === "climate" && name === "set_temperature") { const temperature = Number(input.input.temperature); if (Number.isFinite(temperature) && temperature >= 16 && temperature <= 26) return { domain, service: name, data: { entity_id: entityId, temperature } }; }
  return null;
}
async function markUncertain(input: ProviderExecutionInput, entityId: string, commandName: string) {
  if (!input.idempotencyKey) return;
  await prisma.lifeTransaction.upsert({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } }, update: { state: "uncertain", failureReason: "Home Assistant command timed out after dispatch; manual state reconciliation is required." }, create: { userId: input.userId, capabilityKey: "home.device.control", executionLevel: "transact", state: "uncertain", providerId: "home-assistant", providerCandidatesJson: encodeJson(["home-assistant"]), approvalRequired: true, idempotencyKey: input.idempotencyKey, inputJson: encodeJson({ entityId, command: commandName }), failureReason: "Home Assistant command timed out after dispatch; manual state reconciliation is required." } });
}
async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const toolRunId = input.previousToolRunId ?? randomUUID();
  if (input.capability.key === "home.device.read" && ["status", "sync_status", "search"].includes(input.action)) {
    if (env.LIVE_SMART_HOME_READ_ENABLED !== "true") return blocked(input, "Live smart-home reads are not enabled in this environment.");
    const ready = connection(input); if ("error" in ready) return ready.error;
    const requested = Array.isArray(input.input.entityIds) ? input.input.entityIds.map(text).filter(Boolean) : Array.from(ready.entityAllowlist);
    if (!requested.length || requested.some((entityId) => !ready.entityAllowlist.has(entityId))) return blocked(input, "Every requested Home Assistant entity must be explicitly allowlisted.");
    const states: ReturnType<typeof safeEntity>[] = [];
    for (const entityId of requested.slice(0, 50)) { const result = await request(input, `/api/states/${encodeURIComponent(entityId)}`, "GET"); if ("error" in result) return result.error; states.push(safeEntity(result.value as EntityState)); }
    return { status: "ok", toolRunId, result: { provider: "home-assistant", readOnly: true, fetchedAt: new Date().toISOString(), entities: states } };
  }
  if (input.capability.key === "home.device.control" && input.action === "execute_action") {
    if (env.LIVE_SMART_HOME_CONTROL_ENABLED !== "true") return blocked(input, "Live smart-home control is not enabled in this environment.");
    const ready = connection(input); if ("error" in ready) return ready.error;
    const entityId = text(input.input.entityId); const approvalRequestId = text(input.input.approvalRequestId);
    if (!entityId || !ready.entityAllowlist.has(entityId)) return blocked(input, "The Home Assistant entity is not explicitly allowlisted.");
    if (!input.idempotencyKey || !approvalRequestId || input.approvalOverride?.hitlRequestId !== approvalRequestId) return blocked(input, "An approval for this exact command and an idempotency key are required.");
    const exact = command(input, entityId); if (!exact) return blocked(input, "This command is outside the bounded smart-home command registry.");
    const before = await request(input, `/api/states/${encodeURIComponent(entityId)}`, "GET"); if ("error" in before) return before.error;
    const observed = safeEntity(before.value as EntityState);
    const expectedState = text(input.input.expectedState); if (expectedState && observed.state !== expectedState) return blocked(input, "Device state changed after approval. Review and approve the command again.");
    const result = await request(input, `/api/services/${exact.domain}/${exact.service}`, "POST", exact.data);
    if ("error" in result) { if (result.uncertain) await markUncertain(input, entityId, exact.service); return result.error; }
    const changed = Array.isArray(result.value) ? result.value.map((value: unknown) => safeEntity(value as EntityState)).find((value) => value.entityId === entityId) : undefined;
    return { status: "ok", toolRunId, actionName: `Home Assistant ${exact.domain}.${exact.service}`, result: { provider: "home-assistant", status: "confirmed", entityId, command: exact.service, observedBefore: observed, observedAfter: changed, reconciliationRecommended: !changed } };
  }
  return blocked(input, "Home Assistant does not support this operation.");
}

export const homeAssistantProvider: ProviderAdapter = { providerId: "home-assistant", label: "Home Assistant", kind: "api", toolName: "home_assistant.entities", capabilities: ["home.device.read", "home.device.control"], actions: ["search", "status", "sync_status", "execute_action"], requiresConnectedAccount: true, credentialType: "bearer_token", credentialFields: [{ key: "baseUrl", label: "Home Assistant base URL", type: "url", required: true }, { key: "accessToken", label: "Long-lived access token", type: "password", required: true }, { key: "entityAllowlist", label: "Allowed entity IDs (comma-separated)", type: "text", required: true }], authType: "api_key", riskLevel: "high", description: "Gated Home Assistant entity reads and exact-command control with an explicit per-connection entity allowlist.", supportsHealthCheck: true, canHandle(input) { if (input.preferredProviderId && input.preferredProviderId !== this.providerId) return false; return input.capabilityKey === "home.device.read" ? ["search", "status", "sync_status"].includes(input.action) : input.capabilityKey === "home.device.control" && input.action === "execute_action"; }, execute, async healthCheck() { const read = env.LIVE_SMART_HOME_READ_ENABLED === "true"; return { state: read ? "healthy" : "disabled", message: read ? "Home Assistant reads are enabled; each encrypted connection is checked at execution time." : "Live smart-home access is disabled.", checkedAt: new Date().toISOString() }; } };
