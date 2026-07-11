import { apiGet, apiPost } from "./client";
import type { CreatorAccessRequest } from "./types";

export async function getMyCreatorAccess() {
  return apiGet<{ canCreateMarketplaceAgents: boolean; request: CreatorAccessRequest | null }>("/api/creator-access/me");
}

export async function requestCreatorAccess(reason: string) {
  return apiPost<{ request: CreatorAccessRequest }>("/api/creator-access/request", { reason });
}

export async function listCreatorAccessRequests() {
  return apiGet<{ requests: CreatorAccessRequest[] }>("/api/creator-access/requests");
}

export async function approveCreatorAccessRequest(requestId: string) {
  return apiPost<{ request: CreatorAccessRequest }>(`/api/creator-access/requests/${requestId}/approve`);
}

export async function denyCreatorAccessRequest(requestId: string, note: string) {
  return apiPost<{ request: CreatorAccessRequest }>(`/api/creator-access/requests/${requestId}/deny`, { note });
}
