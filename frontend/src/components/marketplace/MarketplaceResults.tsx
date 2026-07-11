import type { MarketplaceAgent, UserAgentInstall } from "../../api/types";
import type { MarketplaceMatch } from "../../lib/marketplaceMatching";
import { MarketplaceAgentCard } from "./MarketplaceAgentCard";

type MarketplaceResultsProps = {
  cardMatches: MarketplaceMatch[];
  installedByDefinitionId: Map<string, UserAgentInstall>;
  installedDefinitionIds: Set<string>;
  installingAgentId: string;
  isShowingMoreResults: boolean;
  onConfirmInstall: (agent: MarketplaceAgent) => void;
  onOpenDetails: (agent: MarketplaceAgent) => void;
  onOpenInstalledAgent: (agentId: string) => void;
  resultSourceLength: number;
  selectedMarketplaceAgent?: MarketplaceAgent;
  setIsShowingMoreResults: (value: boolean) => void;
};

export function MarketplaceResults(props: MarketplaceResultsProps) {
  const {
    cardMatches,
    installedByDefinitionId,
    installedDefinitionIds,
    installingAgentId,
    isShowingMoreResults,
    onConfirmInstall,
    onOpenDetails,
    onOpenInstalledAgent,
    resultSourceLength,
    selectedMarketplaceAgent,
    setIsShowingMoreResults
  } = props;

  return (
    <div className="marketplace-grid">
      {cardMatches.map((match, index) => {
        const agent = match.agent;
        const install = installedByDefinitionId.get(agent.id);
        const alreadyInstalled = Boolean(agent.installed || installedDefinitionIds.has(agent.id));
        return (
          <MarketplaceAgentCard
            agent={agent}
            alreadyInstalled={alreadyInstalled}
            index={index}
            install={install}
            installingAgentId={installingAgentId}
            key={agent.id}
            match={match}
            onConfirmInstall={onConfirmInstall}
            onOpenDetails={onOpenDetails}
            onOpenInstalledAgent={onOpenInstalledAgent}
            selectedMarketplaceAgent={selectedMarketplaceAgent}
          />
        );
      })}
      {!isShowingMoreResults && resultSourceLength > cardMatches.length ? (
        <button className="marketplace-show-more" onClick={() => setIsShowingMoreResults(true)} type="button">
          Show more helpers
        </button>
      ) : null}
    </div>
  );
}
