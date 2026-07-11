import { useCallback, useState } from "react";
import {
  approveModerationAgent,
  listModerationAgents,
  sendBackModerationAgent
} from "../api/moderation";
import type { CreatorAgent } from "../api/types";

function removeAgent(agents: CreatorAgent[], agentId: string) {
  return agents.filter((agent) => agent.id !== agentId);
}

export function useModeration(input: { formatError: (error: unknown) => string }) {
  const [queue, setQueue] = useState<CreatorAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const refreshModerationQueue = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listModerationAgents();
      setQueue(result.agents);
    } catch (refreshError) {
      setQueue([]);
      setError(input.formatError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function approveAgent(agentId: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await approveModerationAgent(agentId);
      setQueue((current) => removeAgent(current, agentId));
      return result.agent;
    } catch (approveError) {
      setError(input.formatError(approveError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function sendBackAgent(agentId: string, note: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await sendBackModerationAgent(agentId, note);
      setQueue((current) => removeAgent(current, agentId));
      return result.agent;
    } catch (sendBackError) {
      setError(input.formatError(sendBackError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  return {
    queue,
    isLoading,
    isSaving,
    error,
    refreshModerationQueue,
    approveAgent,
    sendBackAgent
  };
}
