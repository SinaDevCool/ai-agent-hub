import { useCallback, useRef, useState } from "react";
import { apiGet } from "../api/client";
import type { ActivityLog, Agent, HitlRequest, MarketplaceAgent, ProviderReceipt, UserAgentInstall, VaultDocument, VaultSchema } from "../api/types";
import { agentDisplayName } from "../lib/agentDisplay";
import { runWithRetry, type RetryOptions } from "../lib/retry";

function displayAgent(agent: Agent): Agent {
  return { ...agent, name: agentDisplayName(agent.name) };
}

function displayMarketplaceAgent(agent: MarketplaceAgent): MarketplaceAgent {
  return { ...agent, name: agentDisplayName(agent.name), tagline: agentDisplayName(agent.tagline), description: agentDisplayName(agent.description) };
}

function displayInstall(install: UserAgentInstall): UserAgentInstall {
  return {
    ...install,
    displayName: agentDisplayName(install.displayName),
    agentDefinition: displayMarketplaceAgent(install.agentDefinition),
    agent: install.agent ? displayAgent(install.agent) : install.agent
  };
}

function displayLog(log: ActivityLog): ActivityLog {
  return log.agent ? { ...log, agent: displayAgent(log.agent) } : log;
}

function displayHitl(request: HitlRequest): HitlRequest {
  return { ...request, agent: displayAgent(request.agent) };
}

export function useWorkspaceData(input: { formatError: (error: unknown) => string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [installedAgents, setInstalledAgents] = useState<UserAgentInstall[]>([]);
  const [schemas, setSchemas] = useState<VaultSchema[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [providerReceipts, setProviderReceipts] = useState<ProviderReceipt[]>([]);
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
      const [agentData, marketplaceData, installedData, schemaData, documentData, logData, receiptData, hitlData] = await runWithRetry(() => Promise.all([
          apiGet<{ agents: Agent[] }>("/api/agents"),
          apiGet<{ agents: MarketplaceAgent[] }>("/api/marketplace/agents"),
          apiGet<{ installs: UserAgentInstall[] }>("/api/me/agents"),
          apiGet<{ schemas: VaultSchema[] }>("/api/vault/schemas"),
          apiGet<{ documents: VaultDocument[] }>("/api/vault/documents"),
          apiGet<{ logs: ActivityLog[] }>("/api/activity"),
          apiGet<{ receipts: ProviderReceipt[] }>("/api/provider-receipts?limit=50"),
          apiGet<{ requests: HitlRequest[] }>("/api/hitl")
        ]), options);
      if (refreshRequestId.current !== requestId) return false;
      setAgents(agentData.agents.map(displayAgent));
      setMarketplaceAgents(marketplaceData.agents.map(displayMarketplaceAgent));
      setInstalledAgents(installedData.installs.map(displayInstall));
      setSchemas(schemaData.schemas);
      setDocuments(documentData.documents);
      setLogs(logData.logs.map(displayLog));
      setProviderReceipts(receiptData.receipts);
      setHitl(hitlData.requests.map(displayHitl));
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
    providerReceipts,
    setProviderReceipts,
    hitl,
    setHitl,
    isRefreshing,
    refreshError,
    setRefreshError,
    refresh
  };
}
