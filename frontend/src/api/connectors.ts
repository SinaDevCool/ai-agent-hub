import { apiDelete, apiGet, apiPost } from "./client";
import type { ConnectedAccount, ConnectorStartResponse } from "./types";

export function listConnectedAccounts() {
  return apiGet<{ accounts: ConnectedAccount[] }>("/api/connectors");
}

export function startConnector(provider: string) {
  return apiPost<ConnectorStartResponse>(`/api/connectors/${provider}/start`);
}

export function disconnectConnector(accountId: string) {
  return apiDelete<{ ok: true }>(`/api/connectors/${accountId}`);
}
