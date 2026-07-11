import type { Dispatch, SetStateAction } from "react";
import { Bot, KeyRound, MessageSquare, Pencil, Pin, Search } from "lucide-react";
import type { Agent } from "../../api/types";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import type { HelperStatusFilter } from "../../hooks/useInstalledHelpers";
import type { SectionId } from "../../lib/appNavigation";
import { friendlyCategoryName } from "../../lib/display";
import { StatusPill } from "../StatusPill";
import type { InstalledAgentCard } from "./WorkspaceSections.types";

type InstalledHelpersSectionProps = {
  activeMobileClass: (section: SectionId) => string;
  agents: Agent[];
  canUseCreatorTools: boolean;
  helperSearch: string;
  helperStatusFilter: HelperStatusFilter;
  helperStatusFilters: Array<{ id: HelperStatusFilter; label: string }>;
  helperSummary: { ready: number; needsAccess: number; needsApproval: number };
  hiddenTestHelperCount: number;
  hideTestHelpers: boolean;
  isHelperAddOpen: boolean;
  isHelperFiltersOpen: boolean;
  isMobileHelperDetailOpen: boolean;
  mobileInstalledAgentCards: InstalledAgentCard[];
  openAgentWizard: () => void;
  openMarketplace: () => void;
  pinnedAgentIds: string[];
  scrollToSection: (section: SectionId) => void;
  sectionClass: (section: SectionId) => string;
  selectedAgent: Agent | undefined;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  setHelperSearch: (value: string) => void;
  setHelperStatusFilter: (value: HelperStatusFilter) => void;
  setHideTestHelpers: (value: boolean) => void;
  setIsHelperAddOpen: Dispatch<SetStateAction<boolean>>;
  setIsHelperFiltersOpen: Dispatch<SetStateAction<boolean>>;
  setMobileHelperDetailOpen: (value: boolean) => void;
  setSelectedAgentId: (agentId: string) => void;
  togglePinnedAgent: (agentId: string) => void;
  visibleInstalledAgentCards: InstalledAgentCard[];
};

export function InstalledHelpersSection(props: InstalledHelpersSectionProps) {
  const {
    activeMobileClass,
    agents,
    canUseCreatorTools,
    helperSearch,
    helperStatusFilter,
    helperStatusFilters,
    helperSummary,
    hiddenTestHelperCount,
    hideTestHelpers,
    isHelperAddOpen,
    isHelperFiltersOpen,
    isMobileHelperDetailOpen,
    mobileInstalledAgentCards,
    openAgentWizard,
    openMarketplace,
    pinnedAgentIds,
    scrollToSection,
    sectionClass,
    selectedAgent,
    setAgentProfileTab,
    setHelperSearch,
    setHelperStatusFilter,
    setHideTestHelpers,
    setIsHelperAddOpen,
    setIsHelperFiltersOpen,
    setMobileHelperDetailOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleInstalledAgentCards
  } = props;

  return (
    <div className={`panel agent-list mobile-section desktop-section ${activeMobileClass("helpers")} ${sectionClass("helpers")} ${isMobileHelperDetailOpen ? "mobile-helper-detail-is-open" : ""}`} id="helpers">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">My Helpers</div>
          <p className="mobile-section-intro">Open a helper, review its access, or remove it from your profile.</p>
        </div>
        <StatusPill tone="blue">{agents.length} total</StatusPill>
      </div>
      <div className="helper-list-controls" aria-label="Find and filter my helpers">
        <label className="helper-search-label">
          <span>Search my helpers</span>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              aria-label="Search my helpers"
              onChange={(event) => setHelperSearch(event.currentTarget.value)}
              placeholder="Search by name, task, or info…"
              value={helperSearch}
            />
          </div>
        </label>
        <div className="helper-toolbar">
          <button aria-expanded={isHelperFiltersOpen} onClick={() => setIsHelperFiltersOpen((current: boolean) => !current)} type="button">Filter</button>
          <button aria-expanded={isHelperAddOpen} onClick={() => setIsHelperAddOpen((current: boolean) => !current)} type="button"><Bot size={16} /> Add helper</button>
        </div>
      </div>
      {isHelperFiltersOpen ? (
        <div className="helper-filter-panel">
          <div className="helper-status-filters" aria-label="Filter helpers by status">
            {helperStatusFilters.map((filter) => (
              <button
                className={helperStatusFilter === filter.id ? "selected" : ""}
                key={filter.id}
                onClick={() => setHelperStatusFilter(filter.id)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          {hiddenTestHelperCount ? (
            <label className="helper-test-toggle">
              <input
                checked={hideTestHelpers}
                onChange={(event) => setHideTestHelpers(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Hide test helpers</span>
              <small>{hiddenTestHelperCount} hidden</small>
            </label>
          ) : null}
          <div className="helper-summary-strip" aria-label="My helper summary">
            <button onClick={() => setHelperStatusFilter("ready")} type="button">
              <strong>{helperSummary.ready}</strong>
              <span>Ready to use</span>
            </button>
            <button onClick={() => setHelperStatusFilter("needs_access")} type="button">
              <strong>{helperSummary.needsAccess}</strong>
              <span>Need permission</span>
            </button>
            <button onClick={() => setHelperStatusFilter("needs_approval")} type="button">
              <strong>{helperSummary.needsApproval}</strong>
              <span>Waiting for you</span>
            </button>
          </div>
        </div>
      ) : null}
      {isHelperAddOpen ? (
        <div className="helper-add-panel">
          <button className="primary-action" onClick={() => openMarketplace()} type="button"><Bot size={16} /> Find a Helper</button>
          {canUseCreatorTools ? <button onClick={openAgentWizard} type="button"><Pencil size={16} /> Create custom</button> : null}
        </div>
      ) : null}
      <div className="mobile-helper-list" aria-label="My AI helpers for mobile">
        {mobileInstalledAgentCards.map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
          const mobileStatusLabel = pendingApprovals ? "Waiting for you" : permissions.missing ? "Needs access" : "Ready";
          const cardActionLabel = pendingApprovals ? "Review" : permissions.missing ? "Review access" : "";
          return (
            <article className={agent.id === selectedAgent?.id ? "mobile-helper-card selected" : "mobile-helper-card"} key={`mobile-${agent.id}`}>
              <button className="mobile-helper-main" onClick={() => {
                setSelectedAgentId(agent.id);
                setAgentProfileTab("chat");
                setMobileHelperDetailOpen(true);
              }} type="button">
                <span>{agent.name}</span>
                <small>{friendlyCategoryName(agent.category)} helper</small>
                <StatusPill tone={cardReadiness.tone}>{mobileStatusLabel}</StatusPill>
              </button>
              <p>{agent.capabilityManifest.description}</p>
              <div className="mobile-helper-foot">
                <small>{permissions.requested ? `${permissions.allowed} of ${permissions.requested} private info categories allowed` : "No private info needed"}</small>
                {pendingApprovals ? <small>{pendingApprovals} waiting for you</small> : null}
                {cardActionLabel ? (
                  <button onClick={() => {
                    setSelectedAgentId(agent.id);
                    scrollToSection("clearance");
                  }} type="button"><KeyRound aria-hidden="true" size={15} /> {cardActionLabel}</button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="installed-agent-list desktop-helper-list">
        {visibleInstalledAgentCards.slice(0, 5).map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
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
                  <small>{friendlyCategoryName(agent.category)} helper</small>
                </button>
                <button
                  aria-label={isPinned ? `Unpin ${agent.name}` : `Pin ${agent.name}`}
                  className={isPinned ? "pin-button selected" : "pin-button"}
                  onClick={() => togglePinnedAgent(agent.id)}
                  title={isPinned ? "Unpin helper" : "Pin helper"}
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
                <button className={pendingApprovals || permissions.missing ? "" : "primary-action"} onClick={() => {
                  setSelectedAgentId(agent.id);
                  if (pendingApprovals || permissions.missing) {
                    scrollToSection("clearance");
                  } else {
                    setAgentProfileTab("chat");
                    scrollToSection("helpers");
                  }
                }} type="button">{pendingApprovals || permissions.missing ? <KeyRound size={15} /> : <MessageSquare size={15} />} {cardActionLabel}</button>
              </div>
            </article>
          );
        })}
      </div>
      {agents.length > 0 && visibleInstalledAgentCards.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No helpers match this view</strong>
          <p>Clear search, switch back to All, or show test helpers if you are checking old smoke data.</p>
          <button onClick={() => {
            setHelperSearch("");
            setHelperStatusFilter("all");
            setHideTestHelpers(false);
          }} type="button">Show all helpers</button>
        </div>
      ) : null}
      {agents.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No helpers yet</strong>
          <p>Start with one helper for a real task like travel, money, schedule, or personal notes.</p>
          <button onClick={() => openMarketplace()} type="button"><Bot size={16} /> Find a helper</button>
        </div>
      ) : null}
      {visibleInstalledAgentCards.length > 5 ? <p className="empty">Showing 5 of {visibleInstalledAgentCards.length} matching helpers. Use search or filters to narrow the list.</p> : null}
    </div>
  );
}
