import { Search, SlidersHorizontal } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import type { Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultSchema } from "../api/types";
import type { MatcherChoice, MarketplaceFilters, MarketplaceMatch, MarketplaceNeed } from "../lib/marketplaceMatching";
import type { OnboardingNeed } from "./OnboardingPanel";
import { StatusPill } from "./StatusPill";
import { MarketplaceInstalledStrip } from "./marketplace/MarketplaceInstalledStrip";
import { MarketplaceMatcher } from "./marketplace/MarketplaceMatcher";
import { MarketplaceNeedBanner } from "./marketplace/MarketplaceNeedBanner";
import { MarketplaceOptionsPanel } from "./marketplace/MarketplaceOptionsPanel";
import { MarketplaceResults } from "./marketplace/MarketplaceResults";
import { MarketplaceSearchControls } from "./marketplace/MarketplaceSearchControls";
import { MarketplaceStatusStates } from "./marketplace/MarketplaceStatusStates";

type MarketplacePanelProps = {
  className: string;
  installedCount: number;
  canUseCreatorTools: boolean;
  onBackToAgents: () => void;
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
  refreshNotice: string;
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
  onCreateCustomAgent: () => void;
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
  selectedNeedContext?: OnboardingNeed | null;
  onClearNeedContext: () => void;
  externalImportSlot?: ReactNode;
};

export function MarketplacePanel(props: MarketplacePanelProps) {
  const [isMatcherOpen, setIsMatcherOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isMoreNeedsOpen, setIsMoreNeedsOpen] = useState(false);
  const [isAddedAgentsOpen, setIsAddedAgentsOpen] = useState(false);
  const [isShowingMoreResults, setIsShowingMoreResults] = useState(false);

  const isInstalled = (agent: MarketplaceAgent) => Boolean(agent.installed || props.installedDefinitionIds.has(agent.id));
  const installedMarketplaceMatches = props.prioritizedMarketplaceMatches.filter((match) => isInstalled(match.agent));
  const discoveryMarketplaceMatches = props.prioritizedMarketplaceMatches.filter((match) => !isInstalled(match.agent));
  const hasDiscoveryResults = discoveryMarketplaceMatches.length > 0;
  const shouldShowInstalledStrip = installedMarketplaceMatches.length > 0 && isAddedAgentsOpen;
  const resultSource = hasDiscoveryResults ? discoveryMarketplaceMatches : installedMarketplaceMatches;
  const defaultResultLimit = props.marketplaceSearch.trim() || props.marketplaceCategory !== "All" ? 6 : 3;
  const cardMatches = resultSource.slice(0, isShowingMoreResults ? 6 : defaultResultLimit);
  const hasActiveSearch = Boolean(props.marketplaceSearch.trim());
  const resultHeading = hasActiveSearch
    ? `Recommended for "${props.marketplaceSearch.trim()}"`
    : props.marketplaceCategory !== "All"
      ? `Recommended for ${props.marketplaceCategory}`
      : "Recommended Agents";
  const resultContext = hasDiscoveryResults ? "Agents you have not added yet." : "Agents already in your hub.";
  const resultCountLabel = `${resultSource.length} ${resultSource.length === 1 ? "result" : "results"}`;

  return (
    <div className={props.className}>
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Find agents</div>
          <p className="mobile-section-intro">Choose what you need. Agents start restricted, and you decide what private info they can read.</p>
        </div>
        <div className="marketplace-heading-actions">
          <StatusPill tone="blue">{props.installedCount} {props.installedCount === 1 ? "agent" : "agents"} added</StatusPill>
          <button className="marketplace-mobile-exit" onClick={props.onBackToAgents} type="button">Back to My Agents</button>
        </div>
      </div>

      <MarketplaceNeedBanner selectedNeedContext={props.selectedNeedContext} onClearNeedContext={props.onClearNeedContext} />

      <section className="marketplace-discovery-card" aria-label="Find agents">
        <MarketplaceSearchControls
          isMoreNeedsOpen={isMoreNeedsOpen}
          marketplaceCategory={props.marketplaceCategory}
          marketplaceCategoryOptions={props.marketplaceCategoryOptions}
          marketplaceNeedOptions={props.marketplaceNeedOptions}
          marketplaceSearch={props.marketplaceSearch}
          setIsMoreNeedsOpen={setIsMoreNeedsOpen}
          setMarketplaceCategory={props.setMarketplaceCategory}
          setMarketplaceSearch={props.setMarketplaceSearch}
          setMatcherNeedId={props.setMatcherNeedId}
        />

        <div className="marketplace-assist-row" aria-label="Agent pool tools">
          <button aria-expanded={isMatcherOpen} onClick={() => setIsMatcherOpen((current) => !current)} type="button">
            <Search size={16} /> Help me choose
          </button>
          <button className="secondary-subtle-action" aria-expanded={isMoreOptionsOpen} onClick={() => setIsMoreOptionsOpen((current) => !current)} type="button">
            <SlidersHorizontal size={16} /> More filters
          </button>
        </div>

        {isMatcherOpen ? (
          <MarketplaceMatcher
            matcherActions={props.matcherActions}
            matcherNeedId={props.matcherNeedId}
            matcherPrivateInfo={props.matcherPrivateInfo}
            marketplaceNeedOptions={props.marketplaceNeedOptions}
            onApplyMatcher={props.onApplyMatcher}
            setMatcherActions={props.setMatcherActions}
            setMatcherNeedId={props.setMatcherNeedId}
            setMatcherPrivateInfo={props.setMatcherPrivateInfo}
          />
        ) : null}

        {isMoreOptionsOpen ? (
          <MarketplaceOptionsPanel
            canUseCreatorTools={props.canUseCreatorTools}
            externalImportSlot={props.canUseCreatorTools ? props.externalImportSlot : undefined}
            isImportOpen={isImportOpen}
            marketplaceFilterLabels={props.marketplaceFilterLabels}
            marketplaceFilters={props.marketplaceFilters}
            onCreateCustomAgent={props.onCreateCustomAgent}
            setIsImportOpen={setIsImportOpen}
            setMarketplaceFilters={props.setMarketplaceFilters}
          />
        ) : null}
      </section>

      {props.canUseCreatorTools && isMoreOptionsOpen && isImportOpen ? props.externalImportSlot : null}

      <MarketplaceStatusStates
        formatError={props.formatError}
        hasInstallableMarketplaceAgent={props.hasInstallableMarketplaceAgent}
        installedMarketplaceMatchesLength={installedMarketplaceMatches.length}
        isRefreshing={props.isRefreshing}
        marketplaceAgentCount={props.marketplaceAgentCount}
        marketplaceError={props.marketplaceError}
        onClearFilters={props.onClearFilters}
        onCreateCustomAgent={props.onCreateCustomAgent}
        canUseCreatorTools={props.canUseCreatorTools}
        onMarketplaceRetry={props.onMarketplaceRetry}
        onRefresh={props.onRefresh}
        refreshError={props.refreshError}
        refreshNotice={props.refreshNotice}
        visibleMarketplaceCount={props.visibleMarketplaceCount}
      />

      <section className="marketplace-results-section" aria-label="Recommended agents">
        <div className="marketplace-results-heading">
          <div>
            <strong>{resultHeading}</strong>
            <span>{resultContext}</span>
          </div>
          <div className="marketplace-results-actions">
            <StatusPill tone="blue">{resultCountLabel}</StatusPill>
            {installedMarketplaceMatches.length ? (
              <button className="marketplace-added-toggle" onClick={() => setIsAddedAgentsOpen((current) => !current)} type="button">
                {isAddedAgentsOpen ? "Hide agents I added" : "Show agents I added"}
              </button>
            ) : null}
          </div>
        </div>

        {shouldShowInstalledStrip ? (
          <MarketplaceInstalledStrip
            discoveryMarketplaceMatchesLength={discoveryMarketplaceMatches.length}
            installedByDefinitionId={props.installedByDefinitionId}
            installedMarketplaceMatches={installedMarketplaceMatches}
            onCreateCustomAgent={props.onCreateCustomAgent}
            canUseCreatorTools={props.canUseCreatorTools}
            onOpenInstalledAgent={props.onOpenInstalledAgent}
          />
        ) : null}

        <MarketplaceResults
          cardMatches={cardMatches}
          installedByDefinitionId={props.installedByDefinitionId}
          installedDefinitionIds={props.installedDefinitionIds}
          installingAgentId={props.installingAgentId}
          isShowingMoreResults={isShowingMoreResults}
          onConfirmInstall={props.onConfirmInstall}
          onOpenDetails={props.onOpenDetails}
          onOpenInstalledAgent={props.onOpenInstalledAgent}
          resultSourceLength={resultSource.length}
          selectedMarketplaceAgent={props.selectedMarketplaceAgent}
          setIsShowingMoreResults={setIsShowingMoreResults}
        />
      </section>
    </div>
  );
}
