import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, HitlRequest, VaultSchema } from "../api/types";

export type AgentStatusFilter = "all" | "ready" | "needs_access" | "needs_approval";

export const agentStatusFilters: Array<{ id: AgentStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "needs_access", label: "Needs access" },
  { id: "needs_approval", label: "Waiting for you" }
];

export function useInstalledAgents(input: {
  agentReadinessFor: (agent: Agent | undefined, schemas: VaultSchema[], approvals: HitlRequest[]) => { tone: "blue" | "amber" | "green" | "red"; label: string; detail: string };
  agents: Agent[];
  hitl: HitlRequest[];
  isTestAgent: (agent: Pick<Agent, "name" | "capabilityManifest">) => boolean;
  permissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => { allowed: number; requested: number; missing: number };
  schemas: VaultSchema[];
}) {
  const [agentSearch, setAgentSearch] = useState("");
  const [agentStatusFilter, setAgentStatusFilter] = useState<AgentStatusFilter>("all");
  const [isAgentFiltersOpen, setIsAgentFiltersOpen] = useState(false);
  const [isAgentAddOpen, setIsAgentAddOpen] = useState(false);
  const [pinnedAgentIds, setPinnedAgentIds] = useState<string[]>([]);
  const [hideTestAgents, setHideTestAgents] = useState(true);
  const [selectedAgentId, setSelectedAgentIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return decodeURIComponent(window.location.pathname.match(/^\/agents\/([^/]+)/)?.[1] ?? "");
  });
  const setSelectedAgentId = useCallback((next: string | ((current: string) => string)) => {
    setSelectedAgentIdState((current) => {
      const agentId = typeof next === "function" ? next(current) : next;
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/agents")) {
        const path = agentId ? `/agents/${encodeURIComponent(agentId)}` : "/agents";
        window.history.replaceState({ section: "helpers", agentId }, "", path);
      }
      return agentId;
    });
  }, []);

  const selectedAgent = useMemo(
    () => input.agents.find((agent) => agent.id === selectedAgentId) ?? input.agents[0],
    [input.agents, selectedAgentId]
  );

  useEffect(() => {
    if (!input.agents.length) {
      setSelectedAgentId("");
      return;
    }
    setSelectedAgentId((current) => input.agents.some((agent) => agent.id === current) ? current : input.agents[0].id);
  }, [input.agents]);

  useEffect(() => {
    function restoreAgentFromHistory() {
      const agentId = decodeURIComponent(window.location.pathname.match(/^\/agents\/([^/]+)/)?.[1] ?? "");
      if (agentId && input.agents.some((agent) => agent.id === agentId)) setSelectedAgentIdState(agentId);
    }
    window.addEventListener("popstate", restoreAgentFromHistory);
    return () => window.removeEventListener("popstate", restoreAgentFromHistory);
  }, [input.agents]);

  const installedAgentCards = useMemo(() => input.agents.map((agent) => ({
    agent,
    readiness: input.agentReadinessFor(agent, input.schemas, input.hitl),
    permissions: input.permissionProgress(agent, input.schemas),
    pendingApprovals: input.hitl.filter((request) => request.agent.id === agent.id).length
  })), [input]);

  const visibleInstalledAgentCards = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();
    return installedAgentCards
      .filter(({ agent, permissions, pendingApprovals }) => {
        const matchesSearch = !search || [
          agent.name,
          agent.category,
          agent.capabilityManifest.description,
          ...(agent.capabilityManifest.requestedSchemas ?? []),
          ...(agent.capabilityManifest.tools ?? [])
        ].some((value) => String(value ?? "").toLowerCase().includes(search));
        const matchesStatus =
          agentStatusFilter === "all"
          || (agentStatusFilter === "ready" && pendingApprovals === 0 && permissions.missing === 0)
          || (agentStatusFilter === "needs_access" && permissions.missing > 0 && pendingApprovals === 0)
          || (agentStatusFilter === "needs_approval" && pendingApprovals > 0);
        const matchesTestVisibility = !hideTestAgents || !input.isTestAgent(agent);
        return matchesSearch && matchesStatus && matchesTestVisibility;
      })
      .sort((left, right) => {
        const leftPinned = pinnedAgentIds.includes(left.agent.id) ? 1 : 0;
        const rightPinned = pinnedAgentIds.includes(right.agent.id) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftTest = input.isTestAgent(left.agent) ? 1 : 0;
        const rightTest = input.isTestAgent(right.agent) ? 1 : 0;
        if (leftTest !== rightTest) return leftTest - rightTest;
        if (left.pendingApprovals !== right.pendingApprovals) return right.pendingApprovals - left.pendingApprovals;
        if (left.permissions.missing !== right.permissions.missing) return right.permissions.missing - left.permissions.missing;
        return left.agent.name.localeCompare(right.agent.name);
      });
  }, [agentSearch, agentStatusFilter, hideTestAgents, input, installedAgentCards, pinnedAgentIds]);

  const hiddenTestAgentCount = useMemo(
    () => installedAgentCards.filter(({ agent }) => input.isTestAgent(agent)).length,
    [input, installedAgentCards]
  );

  const agentSummary = useMemo(() => ({
    ready: installedAgentCards.filter(({ permissions, pendingApprovals }) => permissions.missing === 0 && pendingApprovals === 0).length,
    needsAccess: installedAgentCards.filter(({ permissions, pendingApprovals }) => permissions.missing > 0 && pendingApprovals === 0).length,
    needsApproval: installedAgentCards.filter(({ pendingApprovals }) => pendingApprovals > 0).length
  }), [installedAgentCards]);

  useEffect(() => {
    if (!hideTestAgents || !selectedAgent || !input.isTestAgent(selectedAgent)) return;
    const nextVisibleAgent = visibleInstalledAgentCards[0]?.agent;
    if (nextVisibleAgent) {
      setSelectedAgentId(nextVisibleAgent.id);
    }
  }, [hideTestAgents, input, selectedAgent, visibleInstalledAgentCards]);

  function togglePinnedAgent(agentId: string) {
    setPinnedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [agentId, ...current]
    );
  }

  return {
    agentSearch,
    agentStatusFilter,
    agentSummary,
    hiddenTestAgentCount,
    hideTestAgents,
    installedAgentCards,
    isAgentAddOpen,
    isAgentFiltersOpen,
    mobileInstalledAgentCards: installedAgentCards.slice(0, 5),
    pinnedAgentIds,
    selectedAgent,
    selectedAgentId,
    setAgentSearch,
    setAgentStatusFilter,
    setHideTestAgents,
    setIsAgentAddOpen,
    setIsAgentFiltersOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleAgents: visibleInstalledAgentCards.map((item) => item.agent).slice(0, 8),
    visibleInstalledAgentCards
  };
}
