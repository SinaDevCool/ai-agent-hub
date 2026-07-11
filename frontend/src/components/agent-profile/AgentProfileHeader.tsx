import { KeyRound } from "lucide-react";
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
        <span className="agent-summary-desktop">Can help with {selectedAgentToolsLabel}. Can read {selectedReadableInfoLabel}. Must ask before {selectedRiskyActionsLabel}.</span>
        <span className="agent-summary-mobile">{readiness.label}. Uses saved info only after you allow it.</span>
        {agentProfileTab !== "permissions" ? (
          <button onClick={() => setAgentProfileTab("permissions")} type="button"><KeyRound size={15} /> Review access</button>
        ) : null}
      </div>
    </>
  );
}
