import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Bot, KeyRound, MessageSquare, Pencil, Pin, Plus, Search } from "lucide-react";
import type { Agent } from "../../api/types";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import type { AgentStatusFilter } from "../../hooks/useInstalledAgents";
import { agentListEmptyState } from "../../lib/agentListEmptyState";
import type { SectionId } from "../../lib/appNavigation";
import { friendlyCategoryName } from "../../lib/display";
import { StatusPill } from "../StatusPill";
import type { InstalledAgentCard } from "./WorkspaceSections.types";

type InstalledAgentsSectionProps = {
  activeMobileClass: (section: SectionId) => string;
  agents: Agent[];
  canUseCreatorTools: boolean;
  agentSearch: string;
  agentStatusFilter: AgentStatusFilter;
  agentStatusFilters: Array<{ id: AgentStatusFilter; label: string }>;
  agentSummary: { ready: number; needsAccess: number; needsApproval: number };
  hiddenTestAgentCount: number;
  hideTestAgents: boolean;
  isAgentAddOpen: boolean;
  isAgentFiltersOpen: boolean;
  isMobileAgentDetailOpen: boolean;
  mobileInstalledAgentCards: InstalledAgentCard[];
  openAgentWizard: () => void;
  openMarketplace: () => void;
  pinnedAgentIds: string[];
  scrollToSection: (section: SectionId) => void;
  sectionClass: (section: SectionId) => string;
  selectedAgent: Agent | undefined;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  setAgentSearch: (value: string) => void;
  setAgentStatusFilter: (value: AgentStatusFilter) => void;
  setHideTestAgents: (value: boolean) => void;
  setIsAgentAddOpen: Dispatch<SetStateAction<boolean>>;
  setIsAgentFiltersOpen: Dispatch<SetStateAction<boolean>>;
  setMobileAgentDetailOpen: (value: boolean) => void;
  setSelectedAgentId: (agentId: string) => void;
  togglePinnedAgent: (agentId: string) => void;
  visibleInstalledAgentCards: InstalledAgentCard[];
};

export function InstalledAgentsSection(props: InstalledAgentsSectionProps) {
  const {
    activeMobileClass,
    agents,
    canUseCreatorTools,
    agentSearch,
    agentStatusFilter,
    agentStatusFilters,
    agentSummary,
    hiddenTestAgentCount,
    hideTestAgents,
    isAgentAddOpen,
    isAgentFiltersOpen,
    isMobileAgentDetailOpen,
    openAgentWizard,
    openMarketplace,
    pinnedAgentIds,
    scrollToSection,
    sectionClass,
    selectedAgent,
    setAgentProfileTab,
    setAgentSearch,
    setAgentStatusFilter,
    setHideTestAgents,
    setIsAgentAddOpen,
    setIsAgentFiltersOpen,
    setMobileAgentDetailOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleInstalledAgentCards
  } = props;
  const [isAgentListExpanded, setIsAgentListExpanded] = useState(false);
  const displayedInstalledAgentCards = useMemo(
    () => isAgentListExpanded ? visibleInstalledAgentCards : visibleInstalledAgentCards.slice(0, 5),
    [isAgentListExpanded, visibleInstalledAgentCards]
  );
  const hiddenVisibleAgentCount = Math.max(visibleInstalledAgentCards.length - displayedInstalledAgentCards.length, 0);
  const mobileFilterCounts: Record<AgentStatusFilter, number> = {
    all: agents.length,
    ready: agentSummary.ready,
    needs_access: agentSummary.needsAccess,
    needs_approval: agentSummary.needsApproval
  };
  const emptyAgentList = agentListEmptyState({
    agentSearch,
    agentStatusFilter,
    hiddenTestAgentCount,
    hideTestAgents
  });

  useEffect(() => {
    setIsAgentListExpanded(false);
  }, [agentSearch, agentStatusFilter, hideTestAgents]);

  return (
    <div className={`panel agent-list mobile-section desktop-section ${activeMobileClass("helpers")} ${sectionClass("helpers")} ${isMobileAgentDetailOpen ? "mobile-agent-detail-is-open" : ""}`} id="helpers">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Your agents</div>
          <p className="mobile-section-intro">Use an agent, check access, or remove one.</p>
        </div>
        <StatusPill tone="blue">{agents.length} {agents.length === 1 ? "agent" : "agents"} added</StatusPill>
      </div>
      {(agentSummary.needsApproval || agentSummary.needsAccess) ? (
        <div className="mobile-agent-attention" aria-label="Agents that need attention">
          {agentSummary.needsApproval ? <button onClick={() => setAgentStatusFilter("needs_approval")} type="button">{agentSummary.needsApproval} waiting</button> : null}
          {agentSummary.needsAccess ? <button onClick={() => setAgentStatusFilter("needs_access")} type="button">{agentSummary.needsAccess} need access</button> : null}
        </div>
      ) : null}
      <div className="agent-list-controls" aria-label="Find and filter my agents">
        <label className="agent-search-label">
          <span>Search agents</span>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              aria-label="Search agents"
              autoComplete="off"
              name="agent-search"
              onChange={(event) => setAgentSearch(event.currentTarget.value)}
              placeholder="Search by name, task, or info…"
              value={agentSearch}
            />
          </div>
        </label>
        <div className="agent-toolbar">
          <button className="agent-filter-toggle" aria-expanded={isAgentFiltersOpen} onClick={() => setIsAgentFiltersOpen((current: boolean) => !current)} type="button">Filter</button>
          <button className="agent-add-toggle" aria-expanded={isAgentAddOpen} onClick={() => setIsAgentAddOpen((current: boolean) => !current)} type="button"><Plus size={16} /> Add Agent</button>
        </div>
      </div>
      <div className="mobile-agent-filter-label">View agents</div>
      <div className="mobile-agent-status-chips" aria-label="Filter agents by status">
        {agentStatusFilters.map((filter) => (
          <button
            aria-label={`${filter.label}, ${mobileFilterCounts[filter.id]} ${mobileFilterCounts[filter.id] === 1 ? "agent" : "agents"}`}
            className={agentStatusFilter === filter.id ? "selected" : ""}
            key={`mobile-${filter.id}`}
            onClick={() => setAgentStatusFilter(filter.id)}
            type="button"
          >
            {filter.label}
            {" "}
            <span>{mobileFilterCounts[filter.id]}</span>
          </button>
        ))}
      </div>
      {isAgentFiltersOpen ? (
        <div className="agent-filter-panel">
          <div className="agent-status-filters" aria-label="Filter agents by status">
            {agentStatusFilters.map((filter) => (
              <button
                className={agentStatusFilter === filter.id ? "selected" : ""}
                key={filter.id}
                onClick={() => setAgentStatusFilter(filter.id)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          {hiddenTestAgentCount ? (
            <label className="agent-test-toggle">
              <input
                checked={hideTestAgents}
                onChange={(event) => setHideTestAgents(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Hide test agents</span>
              <small>{hiddenTestAgentCount} hidden</small>
            </label>
          ) : null}
          <div className="agent-summary-strip" aria-label="My agent summary">
            <button onClick={() => setAgentStatusFilter("ready")} type="button">
              <strong>{agentSummary.ready}</strong>
              <span>Ready to use</span>
            </button>
            <button onClick={() => setAgentStatusFilter("needs_access")} type="button">
              <strong>{agentSummary.needsAccess}</strong>
              <span>Need permission</span>
            </button>
            <button onClick={() => setAgentStatusFilter("needs_approval")} type="button">
              <strong>{agentSummary.needsApproval}</strong>
              <span>Waiting for you</span>
            </button>
          </div>
        </div>
      ) : null}
      {isAgentAddOpen ? (
        <div className="agent-add-panel">
          <button className="primary-action" onClick={() => openMarketplace()} type="button"><Bot size={16} /> Find an agent</button>
          {canUseCreatorTools ? <button onClick={openAgentWizard} type="button"><Pencil size={16} /> Create custom</button> : null}
        </div>
      ) : null}
      <div className="mobile-agent-list" aria-label="My AI agents for mobile">
        {displayedInstalledAgentCards.map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
          const mobileStatusLabel = pendingApprovals ? "Waiting for you" : permissions.missing ? "Needs access" : "Ready";
          const accessActionLabel = pendingApprovals ? "Review" : permissions.missing ? "Access" : "Access";
          return (
            <article className={agent.id === selectedAgent?.id ? "mobile-agent-card selected" : "mobile-agent-card"} key={`mobile-${agent.id}`}>
              <div className="mobile-agent-main">
                <div>
                  <span>{agent.name}</span>
                  <small>{friendlyCategoryName(agent.category)} agent</small>
                </div>
                <StatusPill tone={cardReadiness.tone}>{mobileStatusLabel}</StatusPill>
              </div>
              <p>{agent.capabilityManifest.description}</p>
              <div className="mobile-agent-foot">
                <small>{permissions.requested ? `${permissions.allowed} of ${permissions.requested} private info categories allowed` : "No private info needed"}</small>
                {pendingApprovals ? <small>{pendingApprovals} waiting for you</small> : null}
                <div className="mobile-agent-actions">
                  <button className="primary-action" aria-label={`Chat with ${agent.name}`} onClick={() => {
                    setSelectedAgentId(agent.id);
                    setAgentProfileTab("chat");
                    setMobileAgentDetailOpen(true);
                  }} type="button"><MessageSquare aria-hidden="true" size={15} /> Chat</button>
                  <button aria-label={`Review access for ${agent.name}`} onClick={() => {
                    setSelectedAgentId(agent.id);
                    if (pendingApprovals) {
                      scrollToSection("clearance");
                      return;
                    }
                    setAgentProfileTab("permissions");
                    setMobileAgentDetailOpen(true);
                  }} type="button"><KeyRound aria-hidden="true" size={15} /> {accessActionLabel}</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="installed-agent-list desktop-agent-list">
        {displayedInstalledAgentCards.map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
          const cardActionLabel = pendingApprovals ? "Review" : permissions.missing ? "Review access" : "Open chat";
          const isPinned = pinnedAgentIds.includes(agent.id);
          return (
            <article className={agent.id === selectedAgent?.id ? "installed-agent-card selected" : "installed-agent-card"} key={agent.id}>
              <div className="agent-card-head">
                <button className="agent-row" onClick={() => {
                  setSelectedAgentId(agent.id);
                  setAgentProfileTab("chat");
                }} type="button">
                  <span>{agent.name}</span>
                  <small>{friendlyCategoryName(agent.category)} agent</small>
                </button>
                <button
                  aria-label={isPinned ? `Unpin ${agent.name}` : `Pin ${agent.name}`}
                  className={isPinned ? "pin-button selected" : "pin-button"}
                  onClick={() => togglePinnedAgent(agent.id)}
                  title={isPinned ? "Unpin agent" : "Pin agent"}
                  type="button"
                >
                  <Pin size={14} />
                </button>
              </div>
              <div className="installed-agent-status" aria-label={`${agent.name} status`}>
                <StatusPill tone={cardReadiness.tone}>{cardReadiness.label}</StatusPill>
                <small>{pendingApprovals ? `${pendingApprovals} waiting for you` : permissions.missing ? `${permissions.missing} info category ${permissions.missing === 1 ? "needs" : "need"} access` : agent.capabilityManifest.description}</small>
              </div>
              <div className="installed-agent-actions">
                <button
                  aria-label={`${cardActionLabel} for ${agent.name}`}
                  className={pendingApprovals || permissions.missing ? "" : "primary-action"}
                  onClick={() => {
                  setSelectedAgentId(agent.id);
                  if (pendingApprovals) {
                    scrollToSection("clearance");
                  } else {
                    setAgentProfileTab(permissions.missing ? "permissions" : "chat");
                    scrollToSection("helpers");
                  }
                }} type="button">{pendingApprovals || permissions.missing ? <KeyRound size={15} /> : <MessageSquare size={15} />} {cardActionLabel}</button>
              </div>
            </article>
          );
        })}
      </div>
      {agents.length > 0 && visibleInstalledAgentCards.length > 0 ? (
        <div className="agent-list-footer">
          <span>
            {hiddenVisibleAgentCount
              ? `${displayedInstalledAgentCards.length} shown. ${hiddenVisibleAgentCount} more ${hiddenVisibleAgentCount === 1 ? "agent is" : "agents are"} available.`
              : `Showing all ${displayedInstalledAgentCards.length} ${displayedInstalledAgentCards.length === 1 ? "agent" : "agents"}.`}
            {hiddenTestAgentCount && hideTestAgents ? ` ${hiddenTestAgentCount} test/demo hidden.` : ""}
          </span>
          <div>
            {hiddenTestAgentCount && hideTestAgents ? <button onClick={() => setHideTestAgents(false)} type="button">Show hidden</button> : null}
            {hiddenVisibleAgentCount ? (
              <button onClick={() => setIsAgentListExpanded(true)} type="button">Show all {visibleInstalledAgentCards.length} agents</button>
            ) : isAgentListExpanded && visibleInstalledAgentCards.length > 5 ? (
              <button onClick={() => setIsAgentListExpanded(false)} type="button">Show fewer</button>
            ) : null}
          </div>
        </div>
      ) : null}
      {agents.length > 0 && visibleInstalledAgentCards.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>{emptyAgentList.title}</strong>
          <p>{emptyAgentList.body}</p>
          <button onClick={() => {
            setAgentSearch("");
            setAgentStatusFilter("all");
            setHideTestAgents(false);
          }} type="button">{emptyAgentList.actionLabel}</button>
        </div>
      ) : null}
      {agents.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No agents yet</strong>
          <p>Start with one agent for a real task like travel, money, schedule, or personal notes.</p>
          <button onClick={() => openMarketplace()} type="button"><Bot size={16} /> Find an agent</button>
        </div>
      ) : null}
    </div>
  );
}
