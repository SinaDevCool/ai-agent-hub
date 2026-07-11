import { Download, KeyRound, MessageSquare } from "lucide-react";
import type { Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultSchema } from "../../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "../../lib/display";
import type { PermissionProgress } from "../sections/WorkspaceSections.types";

type MarketplaceDetailSheetProps = {
  agent: MarketplaceAgent;
  hitl: HitlRequest[];
  installedByDefinitionId: Map<string, UserAgentInstall>;
  installingAgentId: string;
  marketplaceExamplePrompts: (agent: MarketplaceAgent | undefined) => string[];
  marketplaceTrustReasons: (agent: MarketplaceAgent | undefined) => string[];
  onClose: () => void;
  onConfirmInstall: (agent: MarketplaceAgent) => void;
  onOpenInstalledAgent: (agentId: string) => void;
  onEditInstalledAgentAccess: (agentId: string) => void;
  permissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => PermissionProgress;
  schemas: VaultSchema[];
};

export function MarketplaceDetailSheet(props: MarketplaceDetailSheetProps) {
  const {
    agent,
    hitl,
    installedByDefinitionId,
    installingAgentId,
    marketplaceExamplePrompts,
    marketplaceTrustReasons,
    onClose,
    onConfirmInstall,
    onOpenInstalledAgent,
    onEditInstalledAgentAccess,
    permissionProgress,
    schemas
  } = props;

  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  const install = installedByDefinitionId.get(agent.id);
  const installedAgent = install?.agent ?? undefined;
  const alreadyInstalled = Boolean(agent.installed || install);
  const installedPermissions = permissionProgress(installedAgent, schemas);
  const pendingApprovals = installedAgent ? hitl.filter((request) => request.agent.id === installedAgent.id).length : 0;
  const categoryLabel = friendlyCategoryName(agent.category);
  const trustLabel = agent.trustScore >= 90 ? "Very trusted" : agent.trustScore >= 80 ? "Trusted" : "Safety reviewed";
  const creatorLabel = agent.creator?.verified ? "Verified creator" : "Community listing";
  const canDo = friendlyList(manifest.tools?.map(friendlyToolName) ?? [], "Simple tasks");
  const privateInfo = friendlyList(manifest.requestedSchemas ?? [], "No private info needed");
  const sensitiveActions = friendlyList(manifest.highRiskActions?.map(friendlyActionName) ?? [], "No sensitive actions listed");

  return (
    <div className="confirm-backdrop marketplace-detail-backdrop" role="presentation">
      <section aria-describedby="marketplace-detail-copy" aria-labelledby="marketplace-detail-title" aria-modal="true" className="marketplace-detail-sheet" role="dialog">
        <div className="marketplace-sheet-head">
          <div>
            <div className="panel-title marketplace-sheet-kicker">Helper Details</div>
            <h2 id="marketplace-detail-title">{agent.name}</h2>
            <p id="marketplace-detail-copy">{agent.tagline || agent.description}</p>
          </div>
          <button className="marketplace-sheet-close" onClick={onClose} type="button">Close</button>
        </div>

        <div className="marketplace-sheet-summary" aria-label={`${agent.name} summary`}>
          <span>{categoryLabel} helper</span>
          <span>{trustLabel}</span>
          <span>{creatorLabel}</span>
        </div>

        <div className="marketplace-sheet-decision-grid">
          <div className="marketplace-sheet-section">
            <strong>Good for</strong>
            <span>{agent.description}</span>
          </div>
          <div className="marketplace-sheet-section">
            <strong>Can do</strong>
            <span>{canDo}</span>
          </div>
          <div className="marketplace-sheet-section">
            <strong>Needs access to</strong>
            <span>{privateInfo}</span>
          </div>
          <div className="marketplace-sheet-section">
            <strong>Will ask before</strong>
            <span>{sensitiveActions}</span>
          </div>
        </div>

        <div className="trust-reason-list marketplace-sheet-trust">
          <strong>Why this is safe</strong>
          {marketplaceTrustReasons(agent).map((reason) => <span key={reason}>{reason}</span>)}
        </div>

        {alreadyInstalled ? (
          <div className="installed-marketplace-summary">
            <strong>Added to your profile</strong>
            <span>{installedPermissions.allowed} of {installedPermissions.requested} info categories allowed</span>
            <span>{pendingApprovals ? `${pendingApprovals} waiting for you` : "Nothing waiting"}</span>
            <div>
              {installedAgent ? (
                <button onClick={() => onOpenInstalledAgent(installedAgent.id)} type="button"><MessageSquare aria-hidden="true" size={15} /> Open helper</button>
              ) : null}
              {installedAgent ? (
                <button onClick={() => onEditInstalledAgentAccess(installedAgent.id)} type="button"><KeyRound aria-hidden="true" size={15} /> Edit access</button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="example-prompt-list">
          <strong>Try after installing</strong>
          {marketplaceExamplePrompts(agent).map((prompt) => <span key={prompt}>{prompt}</span>)}
        </div>

        <div className="button-row marketplace-sheet-actions">
          <button
            className="primary-action marketplace-sheet-primary-action"
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
            {alreadyInstalled ? <MessageSquare aria-hidden="true" size={16} /> : <Download aria-hidden="true" size={16} />}
            {alreadyInstalled ? "Open helper" : installingAgentId === agent.id ? "Adding…" : "Add helper"}
          </button>
          <button className="marketplace-sheet-secondary-action" onClick={onClose} type="button">Done</button>
        </div>
      </section>
    </div>
  );
}
