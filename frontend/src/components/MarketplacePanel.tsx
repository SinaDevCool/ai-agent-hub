import { Download, KeyRound, MessageSquare, Pencil, Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultSchema } from "../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "../lib/display";
import type { MatcherChoice, MarketplaceFilters, MarketplaceMatch, MarketplaceNeed } from "../lib/marketplaceMatching";
import { StatusPill } from "./StatusPill";

type MarketplacePanelProps = {
  className: string;
  installedCount: number;
  onBackToHelpers: () => void;
  marketplaceNeedOptions: MarketplaceNeed[];
  matcherNeedId: string;
  setMatcherNeedId: (value: string) => void;
  matcherPrivateInfo: MatcherChoice;
  setMatcherPrivateInfo: (value: MatcherChoice) => void;
  matcherActions: MatcherChoice;
  setMatcherActions: (value: MatcherChoice) => void;
  onApplyMatcher: () => void;
  marketplaceCategory: string;
  setMarketplaceCategory: (value: string) => void;
  marketplaceSearch: string;
  setMarketplaceSearch: (value: string) => void;
  marketplaceCategoryOptions: string[];
  marketplaceFilterLabels: Array<{ id: keyof MarketplaceFilters; label: string }>;
  marketplaceFilters: MarketplaceFilters;
  setMarketplaceFilters: Dispatch<SetStateAction<MarketplaceFilters>>;
  refreshError: string;
  onRefresh: () => void;
  marketplaceError: string;
  formatError: (error: unknown) => string;
  onMarketplaceRetry: () => void;
  isRefreshing: boolean;
  marketplaceAgentCount: number;
  visibleMarketplaceCount: number;
  onClearFilters: () => void;
  prioritizedMarketplaceAgents: MarketplaceAgent[];
  prioritizedMarketplaceMatches: MarketplaceMatch[];
  hasInstallableMarketplaceAgent: boolean;
  onCreateCustomHelper: () => void;
  installedDefinitionIds: Set<string>;
  selectedMarketplaceAgent?: MarketplaceAgent;
  onOpenDetails: (agent: MarketplaceAgent) => void;
  installingAgentId: string;
  onConfirmInstall: (agent: MarketplaceAgent) => void;
  installedByDefinitionId: Map<string, UserAgentInstall>;
  getPermissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => { allowed: number; requested: number; missing: number };
  schemas: VaultSchema[];
  hitl: HitlRequest[];
  marketplaceMatchById: Map<string, MarketplaceMatch>;
  marketplaceTrustReasons: (agent: MarketplaceAgent | undefined) => string[];
  marketplaceExamplePrompts: (agent: MarketplaceAgent | undefined) => string[];
  onOpenInstalledAgent: (agentId: string) => void;
  onEditInstalledAgentAccess: (agentId: string) => void;
};

const matcherChoices: MatcherChoice[] = ["unsure", "yes", "no"];

export function MarketplacePanel(props: MarketplacePanelProps) {
  const {
    className,
    installedCount,
    onBackToHelpers,
    marketplaceNeedOptions,
    matcherNeedId,
    setMatcherNeedId,
    matcherPrivateInfo,
    setMatcherPrivateInfo,
    matcherActions,
    setMatcherActions,
    onApplyMatcher,
    marketplaceCategory,
    setMarketplaceCategory,
    marketplaceSearch,
    setMarketplaceSearch,
    marketplaceCategoryOptions,
    marketplaceFilterLabels,
    marketplaceFilters,
    setMarketplaceFilters,
    refreshError,
    onRefresh,
    marketplaceError,
    formatError,
    onMarketplaceRetry,
    isRefreshing,
    marketplaceAgentCount,
    visibleMarketplaceCount,
    onClearFilters,
    prioritizedMarketplaceAgents,
    prioritizedMarketplaceMatches,
    hasInstallableMarketplaceAgent,
    onCreateCustomHelper,
    installedDefinitionIds,
    selectedMarketplaceAgent,
    onOpenDetails,
    installingAgentId,
    onConfirmInstall,
    installedByDefinitionId,
    getPermissionProgress,
    schemas,
    hitl,
    marketplaceMatchById,
    marketplaceTrustReasons,
    marketplaceExamplePrompts,
    onOpenInstalledAgent,
    onEditInstalledAgentAccess
  } = props;

  return (
    <div className={className}>
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Find a Helper</div>
          <p className="mobile-section-intro">Choose what you need help with. Helpers start restricted, and you decide what private info they can read.</p>
        </div>
        <div className="marketplace-heading-actions">
          <StatusPill tone="blue">{installedCount} installed</StatusPill>
          <button className="marketplace-mobile-exit" onClick={onBackToHelpers} type="button">Back to my helpers</button>
        </div>
      </div>

      <div className="helper-match-panel" aria-label="Helper matcher">
        <div>
          <strong>Find the right helper faster</strong>
          <span>Answer three simple questions. You can still change the results after.</span>
        </div>
        <label>
          <span>I need help with</span>
          <select value={matcherNeedId} onChange={(event) => setMatcherNeedId(event.currentTarget.value)}>
            {marketplaceNeedOptions.map((need) => <option key={need.id} value={need.id}>{need.title}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Will it use private info?</legend>
          {matcherChoices.map((choice) => (
            <label key={`info-${choice}`}>
              <input checked={matcherPrivateInfo === choice} onChange={() => setMatcherPrivateInfo(choice)} type="radio" />
              <span>{choice === "unsure" ? "Not sure" : choice === "yes" ? "Yes" : "No"}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Can it take actions?</legend>
          {matcherChoices.map((choice) => (
            <label key={`actions-${choice}`}>
              <input checked={matcherActions === choice} onChange={() => setMatcherActions(choice)} type="radio" />
              <span>{choice === "unsure" ? "Not sure" : choice === "yes" ? "Yes, with approval" : "No"}</span>
            </label>
          ))}
        </fieldset>
        <button className="primary-action" onClick={onApplyMatcher} type="button"><Search size={16} /> Show matches</button>
      </div>

      <div className="marketplace-need-row" aria-label="Common helper needs">
        {marketplaceNeedOptions.map((need) => (
          <button
            className={marketplaceCategory === need.category && marketplaceSearch === need.query ? "selected" : ""}
            key={need.id}
            onClick={() => {
              setMatcherNeedId(need.id);
              setMarketplaceCategory(need.category);
              setMarketplaceSearch(need.query);
            }}
            type="button"
          >
            <strong>{need.title}</strong>
            <span>{need.detail}</span>
          </button>
        ))}
      </div>

      <div className="marketplace-controls">
        <label>
          <span>What do you need help with?</span>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              aria-label="Search marketplace agents"
              onChange={(event) => setMarketplaceSearch(event.currentTarget.value)}
              placeholder="Try travel, money, email..."
              value={marketplaceSearch}
            />
          </div>
        </label>
        <label>
          <span>Browse by need</span>
          <select aria-label="Filter marketplace category" onChange={(event) => setMarketplaceCategory(event.currentTarget.value)} value={marketplaceCategory}>
            {marketplaceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </div>

      <div className="marketplace-filter-row" aria-label="Marketplace filters">
        {marketplaceFilterLabels.map((filter) => (
          <label key={filter.id}>
            <input
              checked={marketplaceFilters[filter.id]}
              onChange={(event) => {
                const isChecked = event.currentTarget.checked;
                setMarketplaceFilters((current) => ({ ...current, [filter.id]: isChecked }));
              }}
              type="checkbox"
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </div>

      {refreshError ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{refreshError}</p>
          <button onClick={onRefresh} type="button">Retry</button>
        </div>
      ) : null}
      {marketplaceError ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{formatError(marketplaceError)}</p>
          <button onClick={onMarketplaceRetry} type="button">Retry</button>
        </div>
      ) : null}
      {isRefreshing && marketplaceAgentCount === 0 ? <p className="empty">Loading marketplace agents...</p> : null}
      {!isRefreshing && visibleMarketplaceCount === 0 ? (
        <div className="friendly-empty-state">
          <strong>No matching helpers found</strong>
          <p>Try "Travel", "Money", or clear the filters to see more helpers.</p>
          <button onClick={onClearFilters} type="button">Clear filters</button>
        </div>
      ) : null}
      {!isRefreshing && prioritizedMarketplaceAgents.length > 0 && !hasInstallableMarketplaceAgent ? (
        <div className="marketplace-all-added">
          <strong>You already added these helpers</strong>
          <span>Try another need, search for a different helper, or create a custom one.</span>
          <button onClick={onCreateCustomHelper} type="button"><Pencil size={16} /> Create custom helper</button>
        </div>
      ) : null}

      <div className="marketplace-layout">
        <div className="marketplace-grid">
          {prioritizedMarketplaceMatches.slice(0, 6).map((match, index) => {
            const agent = match.agent;
            const manifest = agent.versions[0]?.capabilityManifest ?? {};
            const alreadyInstalled = Boolean(agent.installed || installedDefinitionIds.has(agent.id));
            return (
              <article className={agent.id === selectedMarketplaceAgent?.id ? "marketplace-card selected" : "marketplace-card"} key={agent.id}>
                <div className="marketplace-card-top">
                  <div>
                    <strong>{agent.name}</strong>
                    <small>{friendlyCategoryName(agent.category)} helper</small>
                  </div>
                  <StatusPill tone={alreadyInstalled ? "green" : "blue"}>{alreadyInstalled ? "installed" : "available"}</StatusPill>
                </div>
                <div className="match-summary-row" aria-label={`${agent.name} match summary`}>
                  <strong>{index === 0 ? "Best match" : match.score >= 70 ? "Good match" : "Possible match"}</strong>
                  <span>{match.reasons[0]}</span>
                </div>
                <p>{agent.tagline || agent.description}</p>
                <div className="marketplace-safety-badges" aria-label={`${agent.name} safety summary`}>
                  <span>{agent.creator?.verified ? "Verified helper" : "Community helper"}</span>
                  <span>{manifest.requestedSchemas?.length ? "Uses private info" : "No info needed"}</span>
                  <span>{manifest.highRiskActions?.length ? "Asks you first" : "No risky actions"}</span>
                </div>
                <div className="marketplace-meta">
                  <span><strong>Good for</strong>{agent.tagline || agent.description}</span>
                  <span><strong>May ask to read</strong>{friendlyList(manifest.requestedSchemas ?? [], "No private info")}</span>
                  <span><strong>Will ask before</strong>{friendlyList(manifest.highRiskActions?.map(friendlyActionName) ?? [], "No risky actions listed")}</span>
                </div>
                <div className="marketplace-card-actions">
                  <small>{agent.installCount} installs / {agent.averageRating.toFixed(1)} rating</small>
                  <button onClick={() => onOpenDetails(agent)} type="button">Details</button>
                  <button disabled={alreadyInstalled || installingAgentId === agent.id} onClick={() => onConfirmInstall(agent)} type="button">
                    <Download size={16} /> {alreadyInstalled ? "Added" : installingAgentId === agent.id ? "Adding..." : "Add helper"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {selectedMarketplaceAgent ? (
          <MarketplaceDetail
            agent={selectedMarketplaceAgent}
            hitl={hitl}
            installedByDefinitionId={installedByDefinitionId}
            installingAgentId={installingAgentId}
            marketplaceExamplePrompts={marketplaceExamplePrompts}
            marketplaceMatchById={marketplaceMatchById}
            marketplaceTrustReasons={marketplaceTrustReasons}
            onConfirmInstall={onConfirmInstall}
            onEditInstalledAgentAccess={onEditInstalledAgentAccess}
            onOpenInstalledAgent={onOpenInstalledAgent}
            prioritizedMarketplaceMatches={prioritizedMarketplaceMatches}
            schemas={schemas}
            getPermissionProgress={getPermissionProgress}
          />
        ) : null}
      </div>
    </div>
  );
}

function MarketplaceDetail(props: {
  agent: MarketplaceAgent;
  installedByDefinitionId: Map<string, UserAgentInstall>;
  getPermissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => { allowed: number; requested: number; missing: number };
  schemas: VaultSchema[];
  hitl: HitlRequest[];
  marketplaceMatchById: Map<string, MarketplaceMatch>;
  prioritizedMarketplaceMatches: MarketplaceMatch[];
  marketplaceTrustReasons: (agent: MarketplaceAgent | undefined) => string[];
  marketplaceExamplePrompts: (agent: MarketplaceAgent | undefined) => string[];
  installingAgentId: string;
  onConfirmInstall: (agent: MarketplaceAgent) => void;
  onOpenInstalledAgent: (agentId: string) => void;
  onEditInstalledAgentAccess: (agentId: string) => void;
}) {
  const {
    agent,
    installedByDefinitionId,
    getPermissionProgress,
    schemas,
    hitl,
    marketplaceMatchById,
    prioritizedMarketplaceMatches,
    marketplaceTrustReasons,
    marketplaceExamplePrompts,
    installingAgentId,
    onConfirmInstall,
    onOpenInstalledAgent,
    onEditInstalledAgentAccess
  } = props;
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  const install = installedByDefinitionId.get(agent.id);
  const installedAgent = install?.agent ?? undefined;
  const alreadyInstalled = Boolean(agent.installed || install);
  const installedPermissions = getPermissionProgress(installedAgent, schemas);
  const pendingApprovals = installedAgent ? hitl.filter((request) => request.agent.id === installedAgent.id).length : 0;
  const selectedMatch = marketplaceMatchById.get(agent.id);

  return (
    <aside className="marketplace-detail">
      <div className="marketplace-card-top">
        <div>
          <strong>{agent.name}</strong>
          <small>{friendlyCategoryName(agent.category)} helper</small>
        </div>
        <StatusPill tone={alreadyInstalled ? "green" : "blue"}>{alreadyInstalled ? "installed" : "available"}</StatusPill>
      </div>
      <p>{agent.description}</p>
      <div className="trust-row">
        <span>{agent.creator?.verified ? "Verified creator" : "Community listing"}</span>
        <span>{agent.installCount} installs</span>
        <span>{agent.averageRating.toFixed(1)} rating</span>
      </div>
      {selectedMatch ? (
        <div className="match-reason-list">
          <strong>{prioritizedMarketplaceMatches[0]?.agent.id === agent.id ? "Best match because" : "Why this matches"}</strong>
          {selectedMatch.reasons.map((reason) => <span key={reason}>{reason}</span>)}
        </div>
      ) : null}
      <div className="trust-reason-list">
        <strong>Why you can trust this</strong>
        {marketplaceTrustReasons(agent).map((reason) => <span key={reason}>{reason}</span>)}
      </div>
      {alreadyInstalled ? (
        <div className="installed-marketplace-summary">
          <strong>Added to your profile</strong>
          <span>{installedPermissions.allowed} of {installedPermissions.requested} info categories allowed</span>
          <span>{pendingApprovals ? `${pendingApprovals} approval waiting` : "No approvals waiting"}</span>
          <div>
            {installedAgent ? <button onClick={() => onOpenInstalledAgent(installedAgent.id)} type="button"><MessageSquare size={15} /> Open helper</button> : null}
            {installedAgent ? <button onClick={() => onEditInstalledAgentAccess(installedAgent.id)} type="button"><KeyRound size={15} /> Edit access</button> : null}
          </div>
        </div>
      ) : null}
      <div className="manifest-grid marketplace-detail-grid">
        <div><strong>Can help with</strong><span>{agent.tagline || agent.description}</span></div>
        <div><strong>Can do</strong><span>{friendlyList(manifest.tools?.map(friendlyToolName) ?? [], "Simple tasks")}</span></div>
        <div><strong>May ask to read</strong><span>{friendlyList(manifest.requestedSchemas ?? [], "No private info")}</span></div>
        <div><strong>Will ask before</strong><span>{friendlyList(manifest.highRiskActions?.map(friendlyActionName) ?? [], "Nothing risky listed")}</span></div>
      </div>
      <div className="example-prompt-list">
        <strong>Try after installing</strong>
        {marketplaceExamplePrompts(agent).map((prompt) => <span key={prompt}>{prompt}</span>)}
      </div>
      <button disabled={alreadyInstalled || installingAgentId === agent.id} onClick={() => onConfirmInstall(agent)} type="button">
        <Download size={16} /> {alreadyInstalled ? "Added to profile" : installingAgentId === agent.id ? "Adding..." : "Add helper"}
      </button>
      <p className="marketplace-confidence">You can review and revoke access after adding this helper.</p>
    </aside>
  );
}
