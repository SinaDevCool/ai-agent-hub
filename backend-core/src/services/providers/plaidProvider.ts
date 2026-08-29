import { randomUUID } from "node:crypto";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
let plaidFetch: FetchLike = fetch;
export function setPlaidFetchForTest(value: FetchLike) { plaidFetch = value; }
export function resetPlaidFetchForTest() { plaidFetch = fetch; }
function blocked(input: ProviderExecutionInput, reason: string, connected = true): ProviderExecutionResult { return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code: connected ? "provider_error" : "connector_not_connected", userMessage: reason, nextAction: connected ? "try_again" : "connect_account", retryable: connected }; }

async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  if (input.capability.key !== "finance.transactions.read" || !["search", "sync_status", "status"].includes(input.action)) return blocked(input, "The Plaid adapter is read-only and supports transaction synchronization only.");
  const credentials = input.providerConnection?.credentials ?? {};
  const clientId = String(credentials.clientId ?? ""); const secret = String(credentials.secret ?? ""); const accessToken = String(credentials.accessToken ?? ""); const environment = String(credentials.environment ?? "sandbox");
  if (!clientId || !secret || !accessToken) return blocked(input, "Connect Plaid credentials and a user-authorized access token before synchronizing transactions.", false);
  const baseUrl = environment === "production" ? "https://production.plaid.com" : environment === "development" ? "https://development.plaid.com" : "https://sandbox.plaid.com";
  let cursor = typeof input.input.cursor === "string" ? input.input.cursor : undefined;
  const added: unknown[] = []; const modified: unknown[] = []; const removed: unknown[] = []; let hasMore = true; let pages = 0;
  try {
    while (hasMore && pages < 20) {
      const response = await plaidFetch(`${baseUrl}/transactions/sync`, { method: "POST", headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret }, body: JSON.stringify({ access_token: accessToken, cursor, count: 500 }) });
      const body = await response.json() as { added?: unknown[]; modified?: unknown[]; removed?: unknown[]; next_cursor?: string; has_more?: boolean; error_message?: string };
      if (!response.ok) return blocked(input, body.error_message ?? `Plaid returned HTTP ${response.status}.`);
      added.push(...(body.added ?? [])); modified.push(...(body.modified ?? [])); removed.push(...(body.removed ?? [])); cursor = body.next_cursor; hasMore = body.has_more === true; pages += 1;
    }
    if (hasMore) return blocked(input, "Plaid synchronization exceeded the safe pagination limit.");
    return { status: "ok", toolRunId: input.previousToolRunId ?? randomUUID(), result: { provider: "plaid", readOnly: true, added, modified, removed, nextCursor: cursor, pages } };
  } catch { return blocked(input, "Plaid transaction synchronization could not be reached."); }
}

export const plaidProvider: ProviderAdapter = { providerId: "plaid", label: "Plaid", kind: "api", toolName: "plaid.transactions.sync", capabilities: ["finance.transactions.read"], actions: ["search", "sync_status", "status"], requiresConnectedAccount: true, credentialType: "api_key", credentialFields: [{ key: "clientId", label: "Client ID", type: "password", required: true }, { key: "secret", label: "Secret", type: "password", required: true }, { key: "accessToken", label: "User access token", type: "password", required: true }, { key: "environment", label: "Environment", type: "text", required: false }], authType: "api_key", riskLevel: "medium", description: "Read-only incremental Plaid transaction synchronization.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: "healthy", message: "Plaid adapter installed; connection is checked per user.", checkedAt: new Date().toISOString() }; } };
