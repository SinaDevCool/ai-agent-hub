import { apiGet, apiPost, apiPut } from "./client";
import type { CreatorAgent, CreatorAgentDraftInput, CreatorProfile, CreatorPublishReadiness, CreatorPublishResult } from "./types";

export async function getCreatorProfile() {
  return apiGet<{ profile: CreatorProfile | null }>("/api/creator/profile");
}

export async function updateCreatorProfile(input: { displayName: string; bio: string }) {
  return apiPut<{ profile: CreatorProfile }>("/api/creator/profile", input);
}

export async function listCreatorAgents() {
  return apiGet<{ agents: CreatorAgent[] }>("/api/creator/agents");
}

export async function createCreatorAgentDraft(input: CreatorAgentDraftInput) {
  return apiPost<{ agent: CreatorAgent }>("/api/creator/agents", input);
}

export async function updateCreatorAgentDraft(agentId: string, input: Partial<CreatorAgentDraftInput>) {
  return apiPut<{ agent: CreatorAgent }>(`/api/creator/agents/${agentId}`, input);
}

export async function getCreatorAgentReadiness(agentId: string) {
  return apiGet<{ readiness: CreatorPublishReadiness }>(`/api/creator/agents/${agentId}/readiness`);
}

export async function publishCreatorAgent(agentId: string) {
  return apiPost<CreatorPublishResult>(`/api/creator/agents/${agentId}/publish`);
}

export async function archiveCreatorAgent(agentId: string) {
  return apiPost<{ agent: CreatorAgent }>(`/api/creator/agents/${agentId}/archive`);
}
