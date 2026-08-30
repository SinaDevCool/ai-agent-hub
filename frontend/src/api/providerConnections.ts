import { apiDelete, apiGet, apiPost } from "./client";
import type { ProviderConnection, ProviderConnectionTest } from "./types";

export function listProviderConnections() { return apiGet<{ connections: ProviderConnection[] }>("/api/provider-connections"); }
export function connectCalCom(accessToken: string) { return apiPost<{ connection: ProviderConnection }>("/api/provider-connections", { providerId: "cal-com", displayName: "Cal.com", credentials: { accessToken }, scopes: ["availability:read", "booking:read", "booking:write"], metadata: { credentialSource: "user_api_key", apiVersion: "v2" } }); }
export function testProviderConnection(connectionId: string) { return apiPost<{ connection: ProviderConnection; test: ProviderConnectionTest }>(`/api/provider-connections/${connectionId}/test`); }
export function disconnectProviderConnection(connectionId: string) { return apiDelete<{ ok: true }>(`/api/provider-connections/${connectionId}`); }
