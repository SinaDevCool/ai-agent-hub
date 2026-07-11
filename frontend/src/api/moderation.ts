import { apiGet, apiPost } from "./client";
import type { CreatorAgent } from "./types";

export async function listModerationAgents() {
  return apiGet<{ agents: CreatorAgent[] }>("/api/moderation/creator-agents");
}

export async function approveModerationAgent(agentId: string) {
  return apiPost<{ agent: CreatorAgent }>(`/api/moderation/creator-agents/${agentId}/approve`);
}

export async function sendBackModerationAgent(agentId: string, note: string) {
  return apiPost<{ agent: CreatorAgent }>(`/api/moderation/creator-agents/${agentId}/send-back`, { note });
}
