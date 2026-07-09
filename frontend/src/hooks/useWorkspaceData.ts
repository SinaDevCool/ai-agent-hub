import { useState } from "react";
import { apiGet } from "../api/client";
import type { ActivityLog, Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultDocument, VaultSchema } from "../api/types";

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

  async function refresh() {
    setIsRefreshing(true);
    setRefreshError("");
    try {
      const [agentData, marketplaceData, installedData, schemaData, documentData, logData, hitlData] = await Promise.all([
        apiGet<{ agents: Agent[] }>("/api/agents"),
        apiGet<{ agents: MarketplaceAgent[] }>("/api/marketplace/agents"),
        apiGet<{ installs: UserAgentInstall[] }>("/api/me/agents"),
        apiGet<{ schemas: VaultSchema[] }>("/api/vault/schemas"),
        apiGet<{ documents: VaultDocument[] }>("/api/vault/documents"),
        apiGet<{ logs: ActivityLog[] }>("/api/activity"),
        apiGet<{ requests: HitlRequest[] }>("/api/hitl")
      ]);
      setAgents(agentData.agents);
      setMarketplaceAgents(marketplaceData.agents);
      setInstalledAgents(installedData.installs);
      setSchemas(schemaData.schemas);
      setDocuments(documentData.documents);
      setLogs(logData.logs);
      setHitl(hitlData.requests);
    } catch (error) {
      setRefreshError(input.formatError(error));
    } finally {
      setIsRefreshing(false);
    }
  }

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
