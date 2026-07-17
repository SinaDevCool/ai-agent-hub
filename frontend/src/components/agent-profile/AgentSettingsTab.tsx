import { Database, KeyRound, MessageSquare, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import type { Agent } from "../../api/types";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import { friendlyCategoryName } from "../../lib/display";
import { StatusPill } from "../StatusPill";

type AgentSettingsTabProps = {
  externalHost: string | null;
  friendlyTrustLabel: (score: number) => string;
  removeAgentFromProfile: (agent: Agent) => void;
  revokeSelectedAgentAccess: () => "confirm" | "none" | void | Promise<"confirm" | "none" | void>;
  runVaultSearch: () => void | Promise<void>;
  selectedAgent: Agent;
  selectedIsExternal: boolean;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  sourceLabel: string;
  toolResult: string;
  triggerHighRiskAction: () => void | Promise<void>;
  verificationLabel: string;
};

type PendingSettingsAction = "search" | "approval" | "revoke" | "remove" | "";

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
    toolResult,
    triggerHighRiskAction,
    verificationLabel
  } = props;
  const [pendingAction, setPendingAction] = useState<PendingSettingsAction>("");
  const [actionNotice, setActionNotice] = useState("");

  async function runSettingAction(action: Exclude<PendingSettingsAction, "remove" | "">, task: () => "confirm" | "none" | void | Promise<"confirm" | "none" | void>) {
    if (pendingAction) return;
    setActionNotice("");
    setPendingAction(action);
    try {
      const result = await task();
      if (action === "search") {
        setActionNotice("Search finished. Activity shows what this agent checked.");
        setAgentProfileTab("activity");
      }
      if (action === "approval") {
        setActionNotice("Approval flow started. Chat shows what is waiting for you.");
        setAgentProfileTab("chat");
      }
      if (action === "revoke") {
        setActionNotice(result === "none" ? "There is no saved info access to remove." : "Review the confirmation to remove access.");
      }
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "That action did not finish. Please try again.");
    } finally {
      setPendingAction("");
    }
  }

  function requestRemoveAgent() {
    if (pendingAction) return;
    setActionNotice("Confirm removal to continue.");
    setPendingAction("remove");
    removeAgentFromProfile(selectedAgent);
    window.setTimeout(() => setPendingAction(""), 0);
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
        <button aria-label={`Open chat with ${selectedAgent.name}`} disabled={Boolean(pendingAction)} onClick={() => setAgentProfileTab("chat")} type="button"><MessageSquare size={16} /> Open chat</button>
        <button aria-label={`Search personal info with ${selectedAgent.name}`} disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("search", runVaultSearch)} type="button">
          <Database size={16} /> {pendingAction === "search" ? "Searching…" : "Search personal info"}
        </button>
        <button aria-label={`Try approval flow for ${selectedAgent.name}`} disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("approval", triggerHighRiskAction)} type="button">
          <Zap size={16} /> {pendingAction === "approval" ? "Starting…" : "Try approval flow"}
        </button>
        <button aria-label={`Remove saved info access from ${selectedAgent.name}`} disabled={Boolean(pendingAction)} onClick={() => void runSettingAction("revoke", revokeSelectedAgentAccess)} type="button">
          <KeyRound size={16} /> {pendingAction === "revoke" ? "Checking access…" : "Remove saved info access"}
        </button>
        <button aria-label={`Remove ${selectedAgent.name}`} className="danger" disabled={Boolean(pendingAction)} onClick={requestRemoveAgent} type="button">
          <Trash2 size={16} /> {pendingAction === "remove" ? "Opening review…" : "Remove agent"}
        </button>
      </div>
      {actionNotice || toolResult ? (
        <p className="agent-settings-feedback" role="status" aria-live="polite">{actionNotice || toolResult}</p>
      ) : null}
    </section>
  );
}
