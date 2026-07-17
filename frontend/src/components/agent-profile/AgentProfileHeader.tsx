import { KeyRound, MessageSquare } from "lucide-react";
import type { Agent } from "../../api/types";
import { StatusPill } from "../StatusPill";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import type { ToneState } from "./agentProfileTypes";

type AgentProfileHeaderProps = {
  agentProfileTab: AgentProfileTab;
  readiness: ToneState;
  selectedAgent: Agent;
  selectedAgentToolsLabel: string;
  selectedReadableInfoLabel: string;
  selectedRiskyActionsLabel: string;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
};

export function AgentProfileHeader(props: AgentProfileHeaderProps) {
  const {
    readiness,
    agentProfileTab,
    selectedAgent,
    selectedAgentToolsLabel,
    selectedReadableInfoLabel,
    selectedRiskyActionsLabel,
    setAgentProfileTab
  } = props;

  const readinessLabel = readiness.label.toLowerCase();
  const isWaiting = readinessLabel.includes("waiting");
  const needsAccess = readinessLabel.includes("needs access");
  const isStopped = readinessLabel.includes("stopped") || readinessLabel.includes("blocked");
  const mobileSummary = isWaiting
    ? "One approval is waiting before this agent continues."
    : needsAccess
      ? "Allow saved info before this agent can answer well."
      : isStopped
        ? "Review what stopped before continuing."
        : "Ready to help using only approved info.";
  const mobileActionLabel = isWaiting ? "Review approval" : agentProfileTab === "permissions" ? "Open chat" : "Review access";
  const mobileActionTab: AgentProfileTab = isWaiting ? "chat" : agentProfileTab === "permissions" ? "chat" : "permissions";
  const MobileActionIcon = agentProfileTab === "permissions" ? MessageSquare : KeyRound;

  return (
    <>
      <div className="agent-use-header">
        <div>
          <div className="panel-title">Use This Agent</div>
          <h2>{selectedAgent.name}</h2>
          <p>{selectedAgent.capabilityManifest.description}</p>
        </div>
        <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
      </div>
      <div className="agent-quick-summary" aria-label={`${selectedAgent.name} safety summary`}>
        <div>
          <strong>{readiness.detail}</strong>
          <span className="agent-summary-desktop">Can help with {selectedAgentToolsLabel}. Can read {selectedReadableInfoLabel}. Must ask before {selectedRiskyActionsLabel}.</span>
          <span className="agent-summary-mobile">{mobileSummary}</span>
          <span className="agent-summary-mobile-note">You control what this agent can read or do.</span>
        </div>
        <button className="agent-mobile-summary-action" aria-label={`${mobileActionLabel} for ${selectedAgent.name}`} onClick={() => setAgentProfileTab(mobileActionTab)} type="button"><MobileActionIcon size={15} /> {mobileActionLabel}</button>
        {agentProfileTab !== "permissions" ? (
          <button className="agent-desktop-summary-action" aria-label={`Review access for ${selectedAgent.name}`} onClick={() => setAgentProfileTab("permissions")} type="button"><KeyRound size={15} /> Review access</button>
        ) : (
          <button className="agent-desktop-summary-action primary-action" aria-label={`Open chat with ${selectedAgent.name}`} onClick={() => setAgentProfileTab("chat")} type="button"><MessageSquare size={15} /> Open chat</button>
        )}
      </div>
    </>
  );
}
