import { ArrowRight, Download, MessageSquare, ShieldCheck } from "lucide-react";
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
  const primarySafetyBadge = safetyBadges(agent)[0] ?? "Starts restricted";

  return (
    <article className={agent.id === selectedMarketplaceAgent?.id ? "marketplace-card selected" : `marketplace-card${alreadyInstalled ? " installed" : ""}`} key={agent.id}>
      <div className="marketplace-card-top">
        <div className="marketplace-card-identity">
          <span className="agent-avatar" aria-hidden="true">{agent.name.slice(0, 1).toUpperCase()}</span>
          <div>
          <strong>{agent.name}</strong>
          <small>{friendlyCategoryName(agent.category)} agent</small>
          </div>
        </div>
        <StatusPill tone={alreadyInstalled ? "green" : "blue"}>{alreadyInstalled ? "installed" : matchLabel(match, index)}</StatusPill>
      </div>
      <p>{agentValueLine(agent)}</p>
      <div className="match-summary-row" aria-label={`${agent.name} match summary`}>
        <strong><ShieldCheck aria-hidden="true" size={14} /> {primarySafetyBadge}</strong>
        <span>{alreadyInstalled ? "Already added to My Agents." : agentDecisionReason(match, index)}</span>
      </div>
      <div className="marketplace-card-actions">
        <button aria-label={`View details for ${agent.name}`} className="marketplace-card-detail-action" onClick={() => onOpenDetails(agent)} type="button">View Agent <ArrowRight aria-hidden="true" size={15} /></button>
        <button
          aria-label={alreadyInstalled ? `Open ${agent.name}` : `Add ${agent.name}`}
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
          {alreadyInstalled ? "Open agent" : installingAgentId === agent.id ? "Adding…" : "Add Agent"}
        </button>
      </div>
    </article>
  );
}
