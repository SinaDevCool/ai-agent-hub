import { MessageSquare, Pencil } from "lucide-react";
import type { UserAgentInstall } from "../../api/types";
import type { MarketplaceMatch } from "../../lib/marketplaceMatching";

type MarketplaceInstalledStripProps = {
  canUseCreatorTools: boolean;
  discoveryMarketplaceMatchesLength: number;
  installedByDefinitionId: Map<string, UserAgentInstall>;
  installedMarketplaceMatches: MarketplaceMatch[];
  onCreateCustomAgent: () => void;
  onOpenInstalledAgent: (agentId: string) => void;
};

export function MarketplaceInstalledStrip(props: MarketplaceInstalledStripProps) {
  const {
    canUseCreatorTools,
    discoveryMarketplaceMatchesLength,
    installedByDefinitionId,
    installedMarketplaceMatches,
    onCreateCustomAgent,
    onOpenInstalledAgent
  } = props;

  return (
    <section className="marketplace-installed-strip" aria-label="Already added agents">
      <div>
        <strong>Already in My Agents</strong>
        <span>{installedMarketplaceMatches.length} matching {installedMarketplaceMatches.length === 1 ? "agent is" : "agents are"} ready to use.</span>
      </div>
      <div className="marketplace-installed-actions">
        {installedMarketplaceMatches.slice(0, 4).map((match) => {
          const install = installedByDefinitionId.get(match.agent.id);
          const installedAgent = install?.agent ?? undefined;
          return (
            <button
              disabled={!installedAgent}
              key={match.agent.id}
              onClick={() => {
                if (installedAgent) onOpenInstalledAgent(installedAgent.id);
              }}
              type="button"
            >
              <MessageSquare size={15} />
              {match.agent.name}
            </button>
          );
        })}
        {canUseCreatorTools && !discoveryMarketplaceMatchesLength ? (
          <button onClick={onCreateCustomAgent} type="button"><Pencil size={15} /> Create custom agent</button>
        ) : null}
      </div>
    </section>
  );
}
