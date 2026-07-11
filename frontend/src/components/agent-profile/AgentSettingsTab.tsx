import { Database, KeyRound, MessageSquare, Trash2, Zap } from "lucide-react";
import { useState } from "react";
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
  const [pendingAction, setPendingAction] = useState<"search" | "approval" | "revoke" | "">("");

  async function runSettingAction(action: "search" | "approval" | "revoke", task: () => void | Promise<void>) {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await task();
      if (action === "approval") setAgentProfileTab("chat");
    } finally {
      setPendingAction("");
    }
  }

  return (
    <section className="agent-tab-panel" aria-label="Agent settings">
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
          <small>This agent uses the same permission and receipt controls as the rest of your hub.</small>
        )}
      </div>
      <div className="manifest-grid">
        <div><strong>Category</strong><span>{friendlyCategoryName(selectedAgent.category)}</span></div>
        <div><strong>Trust</strong><span>{friendlyTrustLabel(selectedAgent.trustScore)} / {selectedAgent.trustScore}</span></div>
        <div><strong>Control</strong><span>Can only use what you allow</span></div>
      </div>
      <div className="button-row">
        <button disabled={Boolean(pendingAction)} onClick={() => setAgentProfileTab("chat")} type="button"><MessageSquare size={16} /> Open chat</button>
        <button disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("search", runVaultSearch)} type="button">
          <Database size={16} /> {pendingAction === "search" ? "Searching…" : "Search personal info"}
        </button>
        <button disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("approval", triggerHighRiskAction)} type="button">
          <Zap size={16} /> {pendingAction === "approval" ? "Starting…" : "Try approval flow"}
        </button>
        <button disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("revoke", revokeSelectedAgentAccess)} type="button">
          <KeyRound size={16} /> {pendingAction === "revoke" ? "Removing…" : "Remove saved info access"}
        </button>
        <button className="danger" onClick={() => removeAgentFromProfile(selectedAgent)} type="button"><Trash2 size={16} /> Remove agent</button>
      </div>
    </section>
  );
}
