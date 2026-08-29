import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { decodeJson, encodeJson } from "../jsonService.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;
type Json = Record<string, unknown>;
let plaidFetch: FetchLike = fetch;
export function setPlaidFetchForTest(value: FetchLike) { plaidFetch = value; }
export function resetPlaidFetchForTest() { plaidFetch = fetch; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function blocked(input: ProviderExecutionInput, reason: string, connected = true, retryable = connected): ProviderExecutionResult { return { status: "blocked", toolRunId: input.previousToolRunId ?? randomUUID(), reason, code: connected ? "provider_error" : "connector_not_connected", userMessage: reason, nextAction: connected ? "try_again" : "connect_account", retryable }; }
function baseUrl(environment: string) { return environment === "production" ? "https://production.plaid.com" : environment === "development" ? "https://development.plaid.com" : "https://sandbox.plaid.com"; }

async function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  if (input.capability.key !== "finance.transactions.read" || !["search", "sync_status", "status"].includes(input.action)) return blocked(input, "The Plaid adapter is read-only and supports transaction synchronization only.", true, false);
  if (env.LIVE_FINANCE_ENABLED !== "true") return blocked(input, "Live finance synchronization is not enabled in this environment.", true, false);
  const credentials = input.providerConnection?.credentials ?? {};
  const clientId = text(credentials.clientId); const secret = text(credentials.secret); const accessToken = text(credentials.accessToken); const environment = text(credentials.environment) || "sandbox";
  if (!clientId || !secret || !accessToken || !input.providerConnection) return blocked(input, "Connect Plaid credentials and a user-authorized access token before synchronizing transactions.", false, false);
  const call = async (path: string, payload: Json) => {
    const response = await plaidFetch(`${baseUrl(environment)}${path}`, { method: "POST", signal: globalThis.AbortSignal.timeout(env.FINANCE_PROVIDER_TIMEOUT_MS), headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret }, body: JSON.stringify({ access_token: accessToken, ...payload }) });
    const body = await response.json() as Json;
    if (!response.ok || body.error_code) throw Object.assign(new Error(text(body.error_message) || `Plaid returned HTTP ${response.status}.`), { code: text(body.error_code), retryable: response.status === 408 || response.status === 429 || response.status >= 500 });
    return body;
  };
  try {
    const connection = await prisma.providerConnection.findUnique({ where: { id: input.providerConnection.id } });
    if (!connection || connection.userId !== input.userId || connection.providerId !== "plaid") return blocked(input, "The Plaid connection is unavailable.", false, false);
    const lock = await prisma.providerConnection.updateMany({ where: { id: connection.id, userId: input.userId, status: "active" }, data: { status: "refreshing" } });
    if (!lock.count) return blocked(input, "This financial connection is already synchronizing. Try again shortly.", true, true);
    const metadata = decodeJson<Json>(connection.metadata, {});
    const item = await call("/item/get", {}); const itemValue = (item.item && typeof item.item === "object" ? item.item : {}) as Json;
    const itemId = text(itemValue.item_id); const consentExpiration = text(itemValue.consent_expiration_time);
    const accountsResponse = await call("/accounts/get", {}); const rawAccounts = Array.isArray(accountsResponse.accounts) ? accountsResponse.accounts as Json[] : [];
    const accountIds = new Map<string, string>(); const now = new Date();
    for (const account of rawAccounts) {
      const externalAccountId = text(account.account_id); if (!externalAccountId) continue;
      const balances = account.balances && typeof account.balances === "object" ? account.balances as Json : {};
      const saved = await prisma.financialAccount.upsert({ where: { userId_providerId_externalAccountId: { userId: input.userId, providerId: "plaid", externalAccountId } }, update: { name: text(account.name) || "Linked account", type: text(account.type) || "other", subtype: text(account.subtype) || null, mask: text(account.mask) || null, currency: text(balances.iso_currency_code) || "EUR", currentBalance: typeof balances.current === "number" ? balances.current : null, availableBalance: typeof balances.available === "number" ? balances.available : null, dataFreshAt: now }, create: { userId: input.userId, providerId: "plaid", externalAccountId, name: text(account.name) || "Linked account", type: text(account.type) || "other", subtype: text(account.subtype) || null, mask: text(account.mask) || null, currency: text(balances.iso_currency_code) || "EUR", currentBalance: typeof balances.current === "number" ? balances.current : null, availableBalance: typeof balances.available === "number" ? balances.available : null, dataFreshAt: now } });
      accountIds.set(externalAccountId, saved.id);
    }
    await prisma.financialAccount.deleteMany({ where: { userId: input.userId, providerId: "plaid", externalAccountId: { notIn: [...accountIds.keys()] } } });
    const originalCursor = text(input.input.cursor) || text(metadata.syncCursor) || undefined;
    let cursor = originalCursor; let added: Json[] = []; let modified: Json[] = []; let removed: Json[] = []; let pages = 0; let restarts = 0;
    for (;;) {
      try {
        let hasMore = true;
        while (hasMore && pages < 20) { const page = await call("/transactions/sync", { cursor, count: 500 }); added.push(...(Array.isArray(page.added) ? page.added as Json[] : [])); modified.push(...(Array.isArray(page.modified) ? page.modified as Json[] : [])); removed.push(...(Array.isArray(page.removed) ? page.removed as Json[] : [])); cursor = text(page.next_cursor) || cursor; hasMore = page.has_more === true; pages += 1; }
        if (hasMore) throw Object.assign(new Error("Plaid synchronization exceeded the safe pagination limit."), { retryable: true });
        break;
      } catch (error) {
        if ((error as { code?: string }).code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && restarts < 2) { cursor = originalCursor; added = []; modified = []; removed = []; pages = 0; restarts += 1; continue; }
        throw error;
      }
    }
    for (const transaction of [...added, ...modified]) {
      const externalAccountId = text(transaction.account_id); const financialAccountId = accountIds.get(externalAccountId); const providerTransactionId = text(transaction.transaction_id); const date = new Date(text(transaction.authorized_date) || text(transaction.date));
      if (!financialAccountId || !providerTransactionId || Number.isNaN(date.valueOf())) continue;
      const category = transaction.personal_finance_category && typeof transaction.personal_finance_category === "object" ? transaction.personal_finance_category as Json : {};
      await prisma.financialTransaction.upsert({ where: { userId_providerTransactionId: { userId: input.userId, providerTransactionId } }, update: { financialAccountId, name: text(transaction.name) || "Transaction", merchantName: text(transaction.merchant_name) || null, amount: Number(transaction.amount) || 0, currency: text(transaction.iso_currency_code) || "EUR", date, pending: transaction.pending === true, categoryPrimary: text(category.primary) || null, categoryDetailed: text(category.detailed) || null, removedAt: null }, create: { userId: input.userId, financialAccountId, providerTransactionId, name: text(transaction.name) || "Transaction", merchantName: text(transaction.merchant_name) || null, amount: Number(transaction.amount) || 0, currency: text(transaction.iso_currency_code) || "EUR", date, pending: transaction.pending === true, categoryPrimary: text(category.primary) || null, categoryDetailed: text(category.detailed) || null } });
    }
    const removedIds = removed.map((value) => text(value.transaction_id)).filter(Boolean); if (removedIds.length) await prisma.financialTransaction.updateMany({ where: { userId: input.userId, providerTransactionId: { in: removedIds } }, data: { removedAt: now } });
    await prisma.financialAccount.updateMany({ where: { userId: input.userId, providerId: "plaid" }, data: { syncCursor: cursor, dataFreshAt: now } });
    const consentExpiryDate = consentExpiration ? new Date(consentExpiration) : null; const consentedProducts = Array.isArray(itemValue.consented_products) ? itemValue.consented_products.filter((value): value is string => typeof value === "string").slice(0, 20) : []; const consentedScopes = Array.isArray(itemValue.consented_data_scopes) ? itemValue.consented_data_scopes.filter((value): value is string => typeof value === "string").slice(0, 30) : [];
    await prisma.providerConnection.update({ where: { id: connection.id }, data: { externalAccountId: itemId || connection.externalAccountId, expiresAt: consentExpiryDate && !Number.isNaN(consentExpiryDate.valueOf()) ? consentExpiryDate : connection.expiresAt, metadata: encodeJson({ ...metadata, itemId: itemId || metadata.itemId, syncCursor: cursor, consentExpiration: consentExpiration || metadata.consentExpiration, consentStatus: "active", consentedProducts, consentedScopes, lastSyncAt: now.toISOString() }), lastSuccessAt: now, lastFailureReason: null, status: "active" } });
    return { status: "ok", toolRunId: input.previousToolRunId ?? randomUUID(), result: { provider: "plaid", readOnly: true, added: added.length, modified: modified.length, removed: removed.length, nextCursor: cursor, pages, restarts, accounts: rawAccounts.length, consentExpiration: consentExpiration || null } };
  } catch (error) {
    const value = error as { code?: string; message?: string; retryable?: boolean };
    if (["ITEM_LOGIN_REQUIRED", "ACCESS_NOT_GRANTED", "ITEM_NOT_FOUND"].includes(value.code ?? "")) { await prisma.providerConnection.updateMany({ where: { id: input.providerConnection?.id, userId: input.userId }, data: { status: "reconnect_required", lastFailureAt: new Date(), lastFailureReason: "Reconnect the financial institution to continue read-only synchronization." } }); return blocked(input, "Reconnect the financial institution to continue read-only synchronization.", false, false); }
    await prisma.providerConnection.updateMany({ where: { id: input.providerConnection?.id, userId: input.userId, status: "refreshing" }, data: { status: "active", lastFailureAt: new Date(), lastFailureReason: (value.message || "Plaid synchronization failed.").slice(0, 500) } });
    return blocked(input, value.message || "Plaid transaction synchronization could not be reached.", true, value.retryable !== false);
  }
}

export const plaidProvider: ProviderAdapter = { providerId: "plaid", label: "Plaid", kind: "api", toolName: "plaid.transactions.sync", capabilities: ["finance.transactions.read"], actions: ["search", "sync_status", "status"], requiresConnectedAccount: true, credentialType: "api_key", credentialFields: [{ key: "clientId", label: "Client ID", type: "password", required: true }, { key: "secret", label: "Secret", type: "password", required: true }, { key: "accessToken", label: "User access token", type: "password", required: true }, { key: "environment", label: "Environment", type: "text", required: false }], authType: "api_key", riskLevel: "medium", description: "Gated read-only Plaid account and incremental transaction synchronization.", supportsHealthCheck: true, canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute, async healthCheck() { return { state: env.LIVE_FINANCE_ENABLED === "true" ? "healthy" : "disabled", message: env.LIVE_FINANCE_ENABLED === "true" ? "Plaid read-only synchronization is enabled; connection health is checked per user." : "Live finance synchronization is disabled.", checkedAt: new Date().toISOString() }; } };
