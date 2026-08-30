import { apiDelete, apiGet, apiPost } from "./client";
import type { AccountConnectorReadiness, ConnectedAccount, ConnectorStartResponse } from "./types";

export function listConnectedAccounts() {
  return apiGet<{ accounts: ConnectedAccount[]; providers: AccountConnectorReadiness[] }>("/api/connectors");
}

export type ConnectorCapability = "email_read" | "email_write" | "calendar_read" | "calendar_write" | "files_read";

export function startConnector(provider: string, capabilities?: ConnectorCapability[]) {
  return apiPost<ConnectorStartResponse>(`/api/connectors/${provider}/start`, capabilities?.length ? { capabilities } : {});
}

export function disconnectConnector(accountId: string) {
  return apiDelete<{ ok: true }>(`/api/connectors/${accountId}`);
}
