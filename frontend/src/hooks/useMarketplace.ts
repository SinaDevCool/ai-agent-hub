import { useEffect, useMemo, useState } from "react";
import { apiPost } from "../api/client";
import type { MarketplaceAgent, UserAgentInstall } from "../api/types";
import {
  isInternalMarketplaceAgent,
  marketplaceCategoryMatches,
  parseMarketplaceSearch,
  marketplaceSearchValues,
  scoreMarketplaceAgent,
  type MatcherChoice,
  type MarketplaceFilters,
  type MarketplaceNeed
} from "../lib/marketplaceMatching";

const defaultMarketplaceFilters: MarketplaceFilters = {
  usesPrivateInfo: false,
  canTakeActions: false,
  needsApproval: false
};

function marketplaceStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("q") ?? "",
    category: params.get("category") ?? "All",
    filters: {
      usesPrivateInfo: params.get("privateInfo") === "required",
      canTakeActions: params.get("actions") === "available",
      needsApproval: params.get("approval") === "required"
    }
  };
}

function marketplaceAgentIdFromPath() {
  return window.location.pathname.match(/^\/discover\/agents\/([^/]+)\/?$/)?.[1] ?? "";
}

export function useMarketplace(input: {
  marketplaceAgents: MarketplaceAgent[];
  installedAgents: UserAgentInstall[];
  marketplaceNeedOptions: MarketplaceNeed[];
  refresh: () => Promise<unknown>;
  formatError: (error: unknown) => string;
  onInstalled: (install: UserAgentInstall) => void;
}) {
  const initialUrlState = marketplaceStateFromUrl();
  const [marketplaceSearch, setMarketplaceSearch] = useState(initialUrlState.search);
  const [marketplaceCategory, setMarketplaceCategory] = useState(initialUrlState.category);
  const [matcherNeedId, setMatcherNeedId] = useState("travel");
  const [matcherPrivateInfo, setMatcherPrivateInfo] = useState<MatcherChoice>("unsure");
  const [matcherActions, setMatcherActions] = useState<MatcherChoice>("unsure");
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>(initialUrlState.filters);
  const [selectedMarketplaceAgentId, setSelectedMarketplaceAgentId] = useState("");
  const [confirmInstallAgent, setConfirmInstallAgent] = useState<MarketplaceAgent | null>(null);
  const [marketplaceDetailAgent, setMarketplaceDetailAgent] = useState<MarketplaceAgent | null>(null);
  const [installingAgentId, setInstallingAgentId] = useState("");
  const [marketplaceError, setMarketplaceError] = useState("");

  const installedDefinitionIds = useMemo(
    () => new Set(input.installedAgents.map((install) => install.agentDefinition.id)),
    [input.installedAgents]
  );

  const installedByDefinitionId = useMemo(
    () => new Map(input.installedAgents.map((install) => [install.agentDefinition.id, install])),
    [input.installedAgents]
  );

  const visibleMarketplaceAgents = useMemo(() => {
    const search = marketplaceSearch.trim().toLowerCase();
    const parsedSearch = parseMarketplaceSearch(search);
    return input.marketplaceAgents.filter((agent) => {
      if (isInternalMarketplaceAgent(agent)) return false;
      const manifest = agent.versions[0]?.capabilityManifest ?? {};
      const matchesCategory = marketplaceCategoryMatches(agent.category, marketplaceCategory);
      const searchValues = marketplaceSearchValues(agent).map((value) => value.toLowerCase());
      const matchesSearch = !search
        || searchValues.some((value) => value.includes(search))
        || parsedSearch.terms.some((term) => searchValues.some((value) => value.includes(term)))
        || parsedSearch.categories.some((category) => marketplaceCategoryMatches(agent.category, category));
      const matchesPrivateInfo = !marketplaceFilters.usesPrivateInfo || Boolean(manifest.requestedSchemas?.length);
      const matchesActions = !marketplaceFilters.canTakeActions || Boolean(manifest.tools?.includes("action.execute"));
      const matchesApproval = !marketplaceFilters.needsApproval || Boolean(manifest.highRiskActions?.length);
      return matchesCategory && matchesSearch && matchesPrivateInfo && matchesActions && matchesApproval;
    });
  }, [input.marketplaceAgents, marketplaceCategory, marketplaceFilters, marketplaceSearch]);

  const prioritizedMarketplaceMatches = useMemo(
    () => visibleMarketplaceAgents.map((agent) => scoreMarketplaceAgent({
      agent,
      category: marketplaceCategory,
      search: marketplaceSearch.trim().toLowerCase(),
      filters: marketplaceFilters,
      privateInfo: matcherPrivateInfo,
      actions: matcherActions,
      installed: Boolean(agent.installed || installedDefinitionIds.has(agent.id))
    })).sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftInstalled = Number(Boolean(left.agent.installed || installedDefinitionIds.has(left.agent.id)));
      const rightInstalled = Number(Boolean(right.agent.installed || installedDefinitionIds.has(right.agent.id)));
      if (leftInstalled !== rightInstalled) return leftInstalled - rightInstalled;
      return left.agent.name.localeCompare(right.agent.name);
    }),
    [installedDefinitionIds, marketplaceCategory, marketplaceFilters, marketplaceSearch, matcherActions, matcherPrivateInfo, visibleMarketplaceAgents]
  );

  const prioritizedMarketplaceAgents = useMemo(
    () => prioritizedMarketplaceMatches.map((match) => match.agent),
    [prioritizedMarketplaceMatches]
  );

  const marketplaceMatchById = useMemo(
    () => new Map(prioritizedMarketplaceMatches.map((match) => [match.agent.id, match])),
    [prioritizedMarketplaceMatches]
  );

  const selectedMarketplaceAgent = useMemo(
    () => prioritizedMarketplaceAgents.find((agent) => agent.id === selectedMarketplaceAgentId) ?? prioritizedMarketplaceAgents[0],
    [prioritizedMarketplaceAgents, selectedMarketplaceAgentId]
  );

  const hasInstallableMarketplaceAgent = useMemo(
    () => prioritizedMarketplaceAgents.some((agent) => !agent.installed && !installedDefinitionIds.has(agent.id)),
    [installedDefinitionIds, prioritizedMarketplaceAgents]
  );

  useEffect(() => {
    setSelectedMarketplaceAgentId(prioritizedMarketplaceAgents[0]?.id ?? "");
  }, [marketplaceCategory, marketplaceFilters, marketplaceSearch, matcherActions, matcherPrivateInfo, prioritizedMarketplaceAgents]);

  useEffect(() => {
    if (!prioritizedMarketplaceAgents.length) {
      setSelectedMarketplaceAgentId("");
      return;
    }
    setSelectedMarketplaceAgentId((current) =>
      prioritizedMarketplaceAgents.some((agent) => agent.id === current) ? current : prioritizedMarketplaceAgents[0].id
    );
  }, [prioritizedMarketplaceAgents]);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/discover")) return;
    const params = new URLSearchParams();
    if (marketplaceSearch.trim()) params.set("q", marketplaceSearch.trim());
    if (marketplaceCategory !== "All") params.set("category", marketplaceCategory);
    if (marketplaceFilters.usesPrivateInfo) params.set("privateInfo", "required");
    if (marketplaceFilters.canTakeActions) params.set("actions", "available");
    if (marketplaceFilters.needsApproval) params.set("approval", "required");
    const detailId = marketplaceDetailAgent?.id;
    const pathname = detailId ? `/discover/agents/${encodeURIComponent(detailId)}` : "/discover";
    const nextUrl = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState({ section: "marketplace" }, "", nextUrl);
  }, [marketplaceCategory, marketplaceDetailAgent?.id, marketplaceFilters, marketplaceSearch]);

  useEffect(() => {
    const syncFromLocation = () => {
      const next = marketplaceStateFromUrl();
      setMarketplaceSearch(next.search);
      setMarketplaceCategory(next.category);
      setMarketplaceFilters(next.filters);
      const detailId = marketplaceAgentIdFromPath();
      setMarketplaceDetailAgent(detailId ? input.marketplaceAgents.find((agent) => agent.id === detailId) ?? null : null);
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [input.marketplaceAgents]);

  async function installMarketplaceAgent(agent: MarketplaceAgent) {
    setMarketplaceError("");
    setInstallingAgentId(agent.id);
    try {
      const result = await apiPost<{ install: UserAgentInstall }>(`/api/marketplace/agents/${agent.id}/install`, {
        displayName: agent.name
      });
      await input.refresh();
      input.onInstalled(result.install);
      return true;
    } catch (error) {
      setMarketplaceError(input.formatError(error));
      return false;
    } finally {
      setInstallingAgentId("");
    }
  }

  async function confirmMarketplaceInstall() {
    if (!confirmInstallAgent) return;
    const installed = await installMarketplaceAgent(confirmInstallAgent);
    if (installed) setConfirmInstallAgent(null);
  }

  function applyMarketplaceMatcher() {
    const need = input.marketplaceNeedOptions.find((item) => item.id === matcherNeedId) ?? input.marketplaceNeedOptions[0];
    setMarketplaceCategory(need.category);
    setMarketplaceSearch(need.query);
    setMarketplaceFilters({
      usesPrivateInfo: matcherPrivateInfo === "yes",
      canTakeActions: matcherActions === "yes",
      needsApproval: matcherActions === "yes"
    });
    setSelectedMarketplaceAgentId("");
  }

  function clearMarketplaceFilters() {
    setMarketplaceSearch("");
    setMarketplaceCategory("All");
    setMatcherPrivateInfo("unsure");
    setMatcherActions("unsure");
    setMarketplaceFilters(defaultMarketplaceFilters);
  }

  function openMarketplaceDetails(agent: MarketplaceAgent) {
    setSelectedMarketplaceAgentId(agent.id);
    setMarketplaceDetailAgent(agent);
    const params = window.location.search;
    window.history.pushState({ section: "marketplace", agentId: agent.id }, "", `/discover/agents/${encodeURIComponent(agent.id)}${params}`);
  }

  return {
    marketplaceSearch,
    setMarketplaceSearch,
    marketplaceCategory,
    setMarketplaceCategory,
    matcherNeedId,
    setMatcherNeedId,
    matcherPrivateInfo,
    setMatcherPrivateInfo,
    matcherActions,
    setMatcherActions,
    marketplaceFilters,
    setMarketplaceFilters,
    selectedMarketplaceAgentId,
    setSelectedMarketplaceAgentId,
    confirmInstallAgent,
    setConfirmInstallAgent,
    marketplaceDetailAgent,
    setMarketplaceDetailAgent,
    installingAgentId,
    marketplaceError,
    setMarketplaceError,
    installedDefinitionIds,
    installedByDefinitionId,
    visibleMarketplaceAgents,
    prioritizedMarketplaceMatches,
    prioritizedMarketplaceAgents,
    marketplaceMatchById,
    selectedMarketplaceAgent,
    hasInstallableMarketplaceAgent,
    installMarketplaceAgent,
    confirmMarketplaceInstall,
    applyMarketplaceMatcher,
    clearMarketplaceFilters,
    openMarketplaceDetails
  };
}
