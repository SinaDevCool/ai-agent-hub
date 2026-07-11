import { useCallback, useRef, useState } from "react";
import { apiGet } from "../api/client";
import type { ActivityLog, Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultDocument, VaultSchema } from "../api/types";
import { runWithRetry, type RetryOptions } from "../lib/retry";

export function useWorkspaceData(input: { formatError: (error: unknown) => string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [installedAgents, setInstalledAgents] = useState<UserAgentInstall[]>([]);
  const [schemas, setSchemas] = useState<VaultSchema[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [hitl, setHitl] = useState<HitlRequest[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [refreshError, setRefreshError] = useState("");
  const refreshRequestId = useRef(0);

  const refresh = useCallback(async (options?: RetryOptions) => {
    const requestId = refreshRequestId.current + 1;
    refreshRequestId.current = requestId;
    setIsRefreshing(true);
    setRefreshError("");
    try {
      const [agentData, marketplaceData, installedData, schemaData, documentData, logData, hitlData] = await runWithRetry(() => Promise.all([
          apiGet<{ agents: Agent[] }>("/api/agents"),
          apiGet<{ agents: MarketplaceAgent[] }>("/api/marketplace/agents"),
          apiGet<{ installs: UserAgentInstall[] }>("/api/me/agents"),
          apiGet<{ schemas: VaultSchema[] }>("/api/vault/schemas"),
          apiGet<{ documents: VaultDocument[] }>("/api/vault/documents"),
          apiGet<{ logs: ActivityLog[] }>("/api/activity"),
          apiGet<{ requests: HitlRequest[] }>("/api/hitl")
        ]), options);
      if (refreshRequestId.current !== requestId) return false;
      setAgents(agentData.agents);
      setMarketplaceAgents(marketplaceData.agents);
      setInstalledAgents(installedData.installs);
      setSchemas(schemaData.schemas);
      setDocuments(documentData.documents);
      setLogs(logData.logs);
      setHitl(hitlData.requests);
      return true;
    } catch (error) {
      if (refreshRequestId.current !== requestId) return false;
      setRefreshError(input.formatError(error));
      return false;
    } finally {
      if (refreshRequestId.current === requestId) setIsRefreshing(false);
    }
  }, [input]);

  return {
    agents,
    setAgents,
    marketplaceAgents,
    setMarketplaceAgents,
    installedAgents,
    setInstalledAgents,
    schemas,
    setSchemas,
    documents,
    setDocuments,
    logs,
    setLogs,
    hitl,
    setHitl,
    isRefreshing,
    refreshError,
    setRefreshError,
    refresh
  };
}
