import { Download, KeyRound, MessageSquare } from "lucide-react";
import { useState } from "react";
import type { Agent, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultSchema } from "../../api/types";
import { friendlyCategoryName } from "../../lib/display";
import type { MarketplaceMatch } from "../../lib/marketplaceMatching";
import { StatusPill } from "../StatusPill";

function agentGoodFor(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  return [
    agent.tagline || agent.description,
    ...(manifest.examplePrompts ?? []).slice(0, 2)
  ].filter(Boolean);
}

function agentNotFor(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  return [
    manifest.highRiskActions?.length ? "Surprise bookings, purchases, sending, or sharing without approval" : "High-stakes decisions that should involve a person",
    manifest.requestedSchemas?.length ? "Reading private info until you grant access" : "Tasks that require private data you have not added",
    "Legal, medical, or financial decisions without your review"
  ];
}

function privateInfoLabel(agent: MarketplaceAgent) {
  const requested = agent.versions[0]?.capabilityManifest.requestedSchemas ?? [];
  if (!requested.length) return "No private info required";
  return `${requested.length} private info ${requested.length === 1 ? "type" : "types"} requested`;
}

function sourceLabel(agent: MarketplaceAgent) {
  const sourceType = agent.versions[0]?.capabilityManifest.sourceType;
  if (sourceType === "mcp_server") return "External MCP agent";
  if (sourceType === "openapi_endpoint") return "External OpenAPI agent";
  return "AI Agent Hub agent";
}

function actionLabel(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  if (!manifest.tools?.includes("action.execute")) return "No outside actions";
  return manifest.highRiskActions?.length ? "Actions require approval" : "Low-risk actions only";
}

function agentValueLine(agent: MarketplaceAgent) {
  return agent.tagline || agent.description;
}

export function MarketplaceDetail(props: {
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
  const install = installedByDefinitionId.get(agent.id);
  const installedAgent = install?.agent ?? undefined;
  const alreadyInstalled = Boolean(agent.installed || install);
  const installedPermissions = getPermissionProgress(installedAgent, schemas);
  const pendingApprovals = installedAgent ? hitl.filter((request) => request.agent.id === installedAgent.id).length : 0;
  const selectedMatch = marketplaceMatchById.get(agent.id);
  const selectedMatchRank = prioritizedMarketplaceMatches.findIndex((match) => match.agent.id === agent.id);
  const trustReasons = marketplaceTrustReasons(agent);
  const examplePrompts = marketplaceExamplePrompts(agent);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);

  return (
    <aside className={isSafetyOpen ? "marketplace-detail safety-open" : "marketplace-detail"}>
      <div className="marketplace-card-top">
        <div>
          <strong>{agent.name}</strong>
          <small>{friendlyCategoryName(agent.category)} agent</small>
        </div>
        <StatusPill tone={alreadyInstalled ? "green" : "blue"}>{alreadyInstalled ? "installed" : "available"}</StatusPill>
      </div>
      <p>{agentValueLine(agent)}</p>
      {selectedMatch ? (
        <div className="match-reason-list">
          <strong>{selectedMatchRank === 0 ? "Best match because" : "Why this fits"}</strong>
          <span>{selectedMatch.reasons[0] ?? "Visible safety profile"}</span>
          {selectedMatch.reasons.slice(1, 3).map((reason) => <span key={reason}>{reason}</span>)}
        </div>
      ) : null}
      <div className="marketplace-control-summary">
        <strong>Your control</strong>
        <span>{privateInfoLabel(agent)}. {actionLabel(agent)}. You can review or revoke access after adding it.</span>
      </div>
      <button className="marketplace-safety-toggle" aria-expanded={isSafetyOpen} onClick={() => setIsSafetyOpen((current) => !current)} type="button">
        <KeyRound size={15} /> Safety details
      </button>
      <div className="marketplace-trust-summary" aria-label={`${agent.name} trust summary`}>
        <div><strong>Source</strong><span>{sourceLabel(agent)}</span></div>
        <div><strong>Private Info</strong><span>{privateInfoLabel(agent)}</span></div>
        <div><strong>Actions</strong><span>{actionLabel(agent)}</span></div>
        <div><strong>Creator</strong><span>{agent.creator?.displayName ?? "AI Agent Hub"}{agent.creator?.verified ? " - verified" : ""}</span></div>
        <div><strong>Activity</strong><span>Every access stays visible</span></div>
      </div>
      <div className="trust-row">
        <span>{agent.creator?.verified ? "Verified creator" : "Community listing"}</span>
        <span>{agent.installCount} installs</span>
        <span>{agent.averageRating.toFixed(1)} rating</span>
      </div>
      <div className="trust-reason-list">
        <strong>Why you can trust this</strong>
        {trustReasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}
      </div>
      {alreadyInstalled ? (
        <div className="installed-marketplace-summary">
          <strong>Added to your profile</strong>
          <span>{installedPermissions.allowed} of {installedPermissions.requested} info categories allowed</span>
          <span>{pendingApprovals ? `${pendingApprovals} waiting for you` : "Nothing waiting"}</span>
          <div>
            {installedAgent ? <button onClick={() => onOpenInstalledAgent(installedAgent.id)} type="button"><MessageSquare size={15} /> Open Agent</button> : null}
            {installedAgent ? <button onClick={() => onEditInstalledAgentAccess(installedAgent.id)} type="button"><KeyRound size={15} /> Edit access</button> : null}
          </div>
        </div>
      ) : null}
      <div className="marketplace-fit-grid">
        <section>
          <strong>Good for</strong>
          {agentGoodFor(agent).map((item) => <span key={item}>{item}</span>)}
        </section>
        <section>
          <strong>Not for</strong>
          {agentNotFor(agent).map((item) => <span key={item}>{item}</span>)}
        </section>
      </div>
      <div className="creator-identity-card">
        <strong>{agent.creator?.displayName ?? "AI Agent Hub starter agent"}</strong>
        <span>{agent.creator?.verified ? "Verified creator. Listing reviewed before marketplace visibility." : "Community creator. Safety labels and receipts still apply."}</span>
      </div>
      <div className="example-prompt-list">
        <strong>Try after installing</strong>
        {examplePrompts.slice(0, 3).map((prompt) => <span key={prompt}>{prompt}</span>)}
      </div>
      <button
        className="primary-action marketplace-detail-cta"
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
      <p className="marketplace-confidence">You can review and revoke access after adding this agent.</p>
    </aside>
  );
}
