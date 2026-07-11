import { useEffect, useMemo, useState } from "react";
import type { Agent, HitlRequest, VaultSchema } from "../api/types";

export type HelperStatusFilter = "all" | "ready" | "needs_access" | "needs_approval";

export const helperStatusFilters: Array<{ id: HelperStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "needs_access", label: "Needs access" },
  { id: "needs_approval", label: "Waiting for you" }
];

export function useInstalledHelpers(input: {
  agentReadinessFor: (agent: Agent | undefined, schemas: VaultSchema[], approvals: HitlRequest[]) => { tone: "blue" | "amber" | "green" | "red"; label: string; detail: string };
  agents: Agent[];
  hitl: HitlRequest[];
  isTestHelper: (agent: Pick<Agent, "name" | "capabilityManifest">) => boolean;
  permissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => { allowed: number; requested: number; missing: number };
  schemas: VaultSchema[];
}) {
  const [helperSearch, setHelperSearch] = useState("");
  const [helperStatusFilter, setHelperStatusFilter] = useState<HelperStatusFilter>("all");
  const [isHelperFiltersOpen, setIsHelperFiltersOpen] = useState(false);
  const [isHelperAddOpen, setIsHelperAddOpen] = useState(false);
  const [pinnedAgentIds, setPinnedAgentIds] = useState<string[]>([]);
  const [hideTestHelpers, setHideTestHelpers] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

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

  const installedAgentCards = useMemo(() => input.agents.map((agent) => ({
    agent,
    readiness: input.agentReadinessFor(agent, input.schemas, input.hitl),
    permissions: input.permissionProgress(agent, input.schemas),
    pendingApprovals: input.hitl.filter((request) => request.agent.id === agent.id).length
  })), [input]);

  const visibleInstalledAgentCards = useMemo(() => {
    const search = helperSearch.trim().toLowerCase();
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
          helperStatusFilter === "all"
          || (helperStatusFilter === "ready" && pendingApprovals === 0 && permissions.missing === 0)
          || (helperStatusFilter === "needs_access" && permissions.missing > 0 && pendingApprovals === 0)
          || (helperStatusFilter === "needs_approval" && pendingApprovals > 0);
        const matchesTestVisibility = !hideTestHelpers || !input.isTestHelper(agent);
        return matchesSearch && matchesStatus && matchesTestVisibility;
      })
      .sort((left, right) => {
        const leftPinned = pinnedAgentIds.includes(left.agent.id) ? 1 : 0;
        const rightPinned = pinnedAgentIds.includes(right.agent.id) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftTest = input.isTestHelper(left.agent) ? 1 : 0;
        const rightTest = input.isTestHelper(right.agent) ? 1 : 0;
        if (leftTest !== rightTest) return leftTest - rightTest;
        if (left.pendingApprovals !== right.pendingApprovals) return right.pendingApprovals - left.pendingApprovals;
        if (left.permissions.missing !== right.permissions.missing) return right.permissions.missing - left.permissions.missing;
        return left.agent.name.localeCompare(right.agent.name);
      });
  }, [helperSearch, helperStatusFilter, hideTestHelpers, input, installedAgentCards, pinnedAgentIds]);

  const hiddenTestHelperCount = useMemo(
    () => installedAgentCards.filter(({ agent }) => input.isTestHelper(agent)).length,
    [input, installedAgentCards]
  );

  const helperSummary = useMemo(() => ({
    ready: installedAgentCards.filter(({ permissions, pendingApprovals }) => permissions.missing === 0 && pendingApprovals === 0).length,
    needsAccess: installedAgentCards.filter(({ permissions, pendingApprovals }) => permissions.missing > 0 && pendingApprovals === 0).length,
    needsApproval: installedAgentCards.filter(({ pendingApprovals }) => pendingApprovals > 0).length
  }), [installedAgentCards]);

  useEffect(() => {
    if (!hideTestHelpers || !selectedAgent || !input.isTestHelper(selectedAgent)) return;
    const nextVisibleAgent = visibleInstalledAgentCards[0]?.agent;
    if (nextVisibleAgent) {
      setSelectedAgentId(nextVisibleAgent.id);
    }
  }, [hideTestHelpers, input, selectedAgent, visibleInstalledAgentCards]);

  function togglePinnedAgent(agentId: string) {
    setPinnedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [agentId, ...current]
    );
  }

  return {
    helperSearch,
    helperStatusFilter,
    helperSummary,
    hiddenTestHelperCount,
    hideTestHelpers,
    installedAgentCards,
    isHelperAddOpen,
    isHelperFiltersOpen,
    mobileInstalledAgentCards: installedAgentCards.slice(0, 5),
    pinnedAgentIds,
    selectedAgent,
    selectedAgentId,
    setHelperSearch,
    setHelperStatusFilter,
    setHideTestHelpers,
    setIsHelperAddOpen,
    setIsHelperFiltersOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleAgents: visibleInstalledAgentCards.map((item) => item.agent).slice(0, 8),
    visibleInstalledAgentCards
  };
}
