import { Download, MessageSquare } from "lucide-react";
import type { MarketplaceAgent, UserAgentInstall } from "../../api/types";
import { friendlyCategoryName } from "../../lib/display";
import type { MarketplaceMatch } from "../../lib/marketplaceMatching";
import { StatusPill } from "../StatusPill";
import { agentDecisionReason, agentValueLine, matchLabel, safetyBadges } from "./marketplaceCardUtils";

type MarketplaceAgentCardProps = {
  agent: MarketplaceAgent;
  alreadyInstalled: boolean;
  index: number;
  install: UserAgentInstall | undefined;
  installingAgentId: string;
  match: MarketplaceMatch;
  onConfirmInstall: (agent: MarketplaceAgent) => void;
  onOpenDetails: (agent: MarketplaceAgent) => void;
  onOpenInstalledAgent: (agentId: string) => void;
  selectedMarketplaceAgent?: MarketplaceAgent;
};

export function MarketplaceAgentCard(props: MarketplaceAgentCardProps) {
  const {
    agent,
    alreadyInstalled,
    index,
    install,
    installingAgentId,
    match,
    onConfirmInstall,
    onOpenDetails,
    onOpenInstalledAgent,
    selectedMarketplaceAgent
  } = props;
  const installedAgent = install?.agent ?? undefined;

  return (
    <article className={agent.id === selectedMarketplaceAgent?.id ? "marketplace-card selected" : `marketplace-card${alreadyInstalled ? " installed" : ""}`} key={agent.id}>
      <div className="marketplace-card-top">
        <div>
          <strong>{agent.name}</strong>
          <small>{friendlyCategoryName(agent.category)} agent</small>
        </div>
        <StatusPill tone={alreadyInstalled ? "green" : "blue"}>{alreadyInstalled ? "installed" : matchLabel(match, index)}</StatusPill>
      </div>
      <p>{agentValueLine(agent)}</p>
      <div className="match-summary-row" aria-label={`${agent.name} match summary`}>
        <strong>{alreadyInstalled ? "Ready to use" : matchLabel(match, index)}</strong>
        <span>{alreadyInstalled ? "This agent is already set up in My Agents." : agentDecisionReason(match, index)}</span>
      </div>
      <div className="marketplace-safety-badges" aria-label={`${agent.name} safety summary`}>
        {safetyBadges(agent).slice(0, 2).map((badge) => <span key={badge}>{badge}</span>)}
      </div>
      <div className="marketplace-card-actions">
        <button className="marketplace-card-detail-action" onClick={() => onOpenDetails(agent)} type="button">View Agent</button>
        <button
          className="primary-action marketplace-card-install-action"
          disabled={(alreadyInstalled && !installedAgent) || installingAgentId === agent.id}
          onClick={() => {
            if (installedAgent) {
              onOpenInstalledAgent(installedAgent.id);
              return;
            }
            onConfirmInstall(agent);
          }}
          type="button"
        >
          {alreadyInstalled ? <MessageSquare size={16} /> : <Download size={16} />}
          {alreadyInstalled ? "Open Agent" : installingAgentId === agent.id ? "Adding…" : "Add Agent"}
        </button>
      </div>
    </article>
  );
}
