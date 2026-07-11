import { Database, KeyRound, MessageSquare, Trash2, Zap } from "lucide-react";
import type { Agent } from "../../api/types";
import { friendlyCategoryName } from "../../lib/display";
import { StatusPill } from "../StatusPill";
import type { AgentProfileTab } from "../../hooks/useAgentChat";

type AgentSettingsTabProps = {
  externalHost: string | null;
  friendlyTrustLabel: (score: number) => string;
  removeAgentFromProfile: (agent: Agent) => void;
  revokeSelectedAgentAccess: () => void | Promise<void>;
  runVaultSearch: () => void | Promise<void>;
  selectedAgent: Agent;
  selectedIsExternal: boolean;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  sourceLabel: string;
  triggerHighRiskAction: () => void | Promise<void>;
  verificationLabel: string;
};

export function AgentSettingsTab(props: AgentSettingsTabProps) {
  const {
    externalHost,
    friendlyTrustLabel,
    removeAgentFromProfile,
    revokeSelectedAgentAccess,
    runVaultSearch,
    selectedAgent,
    selectedIsExternal,
    setAgentProfileTab,
    sourceLabel,
    triggerHighRiskAction,
    verificationLabel
  } = props;

  return (
    <section className="agent-tab-panel" aria-label="Helper settings">
      <div className="external-trust-card">
        <div>
          <strong>{sourceLabel}</strong>
          <span>{selectedIsExternal ? "Runs through AI Agent Hub's safety proxy" : "Runs inside your hub permissions"}</span>
        </div>
        <StatusPill tone={selectedIsExternal && selectedAgent.capabilityManifest.verificationStatus !== "verified" ? "amber" : "green"}>{verificationLabel}</StatusPill>
        {selectedIsExternal ? (
          <>
            <small>{externalHost ? `Host: ${externalHost}` : "Host shown after the verified endpoint is available"}</small>
            <small>Only approved private info categories can be shared.</small>
          </>
        ) : (
          <small>This helper uses the same permission and receipt controls as the rest of your hub.</small>
        )}
      </div>
      <div className="manifest-grid">
        <div><strong>Category</strong><span>{friendlyCategoryName(selectedAgent.category)}</span></div>
        <div><strong>Trust</strong><span>{friendlyTrustLabel(selectedAgent.trustScore)} / {selectedAgent.trustScore}</span></div>
        <div><strong>Control</strong><span>Can only use what you allow</span></div>
      </div>
      <div className="button-row">
        <button onClick={() => setAgentProfileTab("chat")} type="button"><MessageSquare size={16} /> Open chat</button>
        <button onClick={() => void runVaultSearch()} type="button"><Database size={16} /> Search personal info</button>
        <button onClick={() => void triggerHighRiskAction()} type="button"><Zap size={16} /> Try approval flow</button>
        <button onClick={() => void revokeSelectedAgentAccess()} type="button"><KeyRound size={16} /> Remove saved info access</button>
        <button className="danger" onClick={() => removeAgentFromProfile(selectedAgent)} type="button"><Trash2 size={16} /> Remove helper</button>
      </div>
    </section>
  );
}
