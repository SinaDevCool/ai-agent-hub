import { useCallback, useMemo, useState } from "react";
import {
  archiveCreatorAgent,
  createCreatorAgentDraft,
  getCreatorProfile,
  listCreatorAgents,
  publishCreatorAgent,
  updateCreatorAgentDraft,
  updateCreatorProfile
} from "../api/creator";
import type { CreatorAgent, CreatorAgentDraftInput, CreatorProfile } from "../api/types";

function replaceAgent(agents: CreatorAgent[], nextAgent: CreatorAgent) {
  return agents.some((agent) => agent.id === nextAgent.id)
    ? agents.map((agent) => agent.id === nextAgent.id ? nextAgent : agent)
    : [nextAgent, ...agents];
}

export function useCreator(input: { formatError: (error: unknown) => string }) {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [agents, setAgents] = useState<CreatorAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const agentsByStatus = useMemo(() => ({
    drafts: agents.filter((agent) => agent.status === "draft"),
    needsReview: agents.filter((agent) => agent.status === "needs_review"),
    published: agents.filter((agent) => agent.status === "published"),
    archived: agents.filter((agent) => agent.status === "archived")
  }), [agents]);

  const refreshCreator = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [profileData, agentData] = await Promise.all([
        getCreatorProfile(),
        listCreatorAgents()
      ]);
      setProfile(profileData.profile);
      setAgents(agentData.agents);
    } catch (refreshError) {
      setError(input.formatError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function saveProfile(profileInput: { displayName: string; bio: string }) {
    setIsSaving(true);
    setError("");
    try {
      const result = await updateCreatorProfile(profileInput);
      setProfile(result.profile);
      return result.profile;
    } catch (saveError) {
      setError(input.formatError(saveError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function createDraft(draft: CreatorAgentDraftInput) {
    setIsSaving(true);
    setError("");
    try {
      const result = await createCreatorAgentDraft(draft);
      setAgents((current) => replaceAgent(current, result.agent));
      return result.agent;
    } catch (createError) {
      setError(input.formatError(createError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateDraft(agentId: string, draft: Partial<CreatorAgentDraftInput>) {
    setIsSaving(true);
    setError("");
    try {
      const result = await updateCreatorAgentDraft(agentId, draft);
      setAgents((current) => replaceAgent(current, result.agent));
      return result.agent;
    } catch (updateError) {
      setError(input.formatError(updateError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function publishDraft(agentId: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await publishCreatorAgent(agentId);
      setAgents((current) => replaceAgent(current, result.agent));
      return result;
    } catch (publishError) {
      setError(input.formatError(publishError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveAgent(agentId: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await archiveCreatorAgent(agentId);
      setAgents((current) => replaceAgent(current, result.agent));
      return result.agent;
    } catch (archiveError) {
      setError(input.formatError(archiveError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  return {
    profile,
    agents,
    agentsByStatus,
    isLoading,
    isSaving,
    error,
    setError,
    refreshCreator,
    saveProfile,
    createDraft,
    updateDraft,
    publishDraft,
    archiveAgent
  };
}
