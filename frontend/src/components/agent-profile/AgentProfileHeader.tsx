import { KeyRound } from "lucide-react";
import type { Agent } from "../../api/types";
import { StatusPill } from "../StatusPill";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import type { ToneState } from "./agentProfileTypes";

type AgentProfileHeaderProps = {
  agentProfileTab: AgentProfileTab;
  readiness: ToneState;
  selectedAgent: Agent;
  selectedHelperToolsLabel: string;
  selectedReadableInfoLabel: string;
  selectedRiskyActionsLabel: string;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
};

export function AgentProfileHeader(props: AgentProfileHeaderProps) {
  const {
    readiness,
    agentProfileTab,
    selectedAgent,
    selectedHelperToolsLabel,
    selectedReadableInfoLabel,
    selectedRiskyActionsLabel,
    setAgentProfileTab
  } = props;

  return (
    <>
      <div className="agent-use-header">
        <div>
          <div className="panel-title">Use This Helper</div>
          <h2>{selectedAgent.name}</h2>
          <p>{selectedAgent.capabilityManifest.description}</p>
        </div>
        <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
      </div>
      <div className="helper-quick-summary" aria-label={`${selectedAgent.name} safety summary`}>
        <span className="helper-summary-desktop">Can help with {selectedHelperToolsLabel}. Can read {selectedReadableInfoLabel}. Must ask before {selectedRiskyActionsLabel}.</span>
        <span className="helper-summary-mobile">{readiness.label}. Uses saved info only after you allow it.</span>
        {agentProfileTab !== "permissions" ? (
          <button onClick={() => setAgentProfileTab("permissions")} type="button"><KeyRound size={15} /> Review access</button>
        ) : null}
      </div>
    </>
  );
}
