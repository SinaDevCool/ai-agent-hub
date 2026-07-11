import type { FormEvent } from "react";
import type { ActivityLog, Agent, AgentConversation, AgentRunResult, HitlRequest, VaultSchema } from "../api/types";
import type { AgentProfileTab, ChatTranscriptItem } from "../hooks/useAgentChat";
import { externalSourceLabel, externalVerificationLabel, hostFromAgent, isExternalAgent } from "../lib/externalRuntimeDisplay";
import { AgentActivityTab } from "./agent-profile/AgentActivityTab";
import { AgentChatTab } from "./agent-profile/AgentChatTab";
import { AgentPermissionsTab } from "./agent-profile/AgentPermissionsTab";
import { AgentProfileHeader } from "./agent-profile/AgentProfileHeader";
import { AgentSettingsTab } from "./agent-profile/AgentSettingsTab";
import type { HelperPrompt, PermissionReviewItem, ToneState } from "./agent-profile/agentProfileTypes";

type AgentProfilePanelProps = {
  className: string;
  selectedAgent: Agent;
  readiness: ToneState;
  selectedAgentToolsLabel: string;
  selectedReadableInfoLabel: string;
  selectedRiskyActionsLabel: string;
  selectedCannotDoLabel: string;
  agentProfileTab: AgentProfileTab;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  isConversationLoading: boolean;
  agentConversation: AgentConversation | null;
  selectedAgentApprovals: HitlRequest[];
  decidingApprovalId: string;
  decideHitl: (requestId: string, approved: boolean) => void | Promise<void>;
  approvalPlainSentence: (action: string) => string;
  approvalReason: (action: string) => string;
  scrollToClearance: () => void;
  agentNextStep: string;
  promptPreview: ToneState;
  suggestedPrompts: HelperPrompt[];
  setChatInput: (value: string) => void;
  selectedReadableInfo: string[];
  selectedRiskyActions: string[];
  chatInput: string;
  isAgentRunning: boolean;
  runAgentChat: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  chatTranscript: ChatTranscriptItem[];
  lastFailedPrompt: string;
  submitAgentPrompt: (prompt: string) => void | Promise<void>;
  approvedContinuation: { requestId: string; actionName: string } | null;
  continueApprovedAction: (actionName: string) => void | Promise<void>;
  agentRunResult: AgentRunResult | null;
  runSummary: string | null;
  allowedPermissionCount: number;
  permissionReview: PermissionReviewItem[];
  selectedAgentLogs: ActivityLog[];
  friendlyLogText: (log: ActivityLog) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyDate: (value: string) => string;
  ungrantedRequestedSchemas: PermissionReviewItem[];
  grantingSchemaName: string;
  grantAllRequestedSchemas: () => void | Promise<void>;
  grantRequestedSchema: (schema: VaultSchema) => void | Promise<void>;
  togglePermission: (schema: VaultSchema, enabled: boolean) => void | Promise<void>;
  friendlyTrustLabel: (score: number) => string;
  onBackToAgents: () => void;
  runVaultSearch: () => void | Promise<void>;
  triggerHighRiskAction: () => void | Promise<void>;
  revokeSelectedAgentAccess: () => void | Promise<void>;
  removeAgentFromProfile: (agent: Agent) => void;
};

const tabs: Array<[AgentProfileTab, string]> = [
  ["chat", "Chat"],
  ["permissions", "Access"],
  ["activity", "Activity"],
  ["settings", "Settings"]
];

export function AgentProfilePanel(props: AgentProfilePanelProps) {
  const {
    className,
    selectedAgent,
    readiness,
    selectedAgentToolsLabel,
    selectedReadableInfoLabel,
    selectedRiskyActionsLabel,
    agentProfileTab,
    setAgentProfileTab,
    onBackToAgents
  } = props;

  const selectedIsExternal = isExternalAgent(selectedAgent);
  const externalHost = hostFromAgent(selectedAgent);
  const sourceLabel = selectedIsExternal ? externalSourceLabel(selectedAgent.capabilityManifest.sourceType) : "Built in AI Agent Hub";
  const verificationLabel = selectedIsExternal ? externalVerificationLabel(selectedAgent.capabilityManifest.verificationStatus) : "Local safety rules";

  return (
    <div className={className}>
      <button className="mobile-back-to-agents" onClick={onBackToAgents} type="button">Back to My Agents</button>
      <div className="agent-use-shell">
        <AgentProfileHeader
          agentProfileTab={agentProfileTab}
          readiness={readiness}
          selectedAgent={selectedAgent}
          selectedAgentToolsLabel={selectedAgentToolsLabel}
          selectedReadableInfoLabel={selectedReadableInfoLabel}
          selectedRiskyActionsLabel={selectedRiskyActionsLabel}
          setAgentProfileTab={setAgentProfileTab}
        />

        <div className="agent-profile-tabs" role="tablist" aria-label={`${selectedAgent.name} workspace`}>
          {tabs.map(([tab, label]) => (
            <button
              aria-selected={agentProfileTab === tab}
              className={agentProfileTab === tab ? "active" : ""}
              key={tab}
              onClick={() => setAgentProfileTab(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <AgentChatTab
          agentConversation={props.agentConversation}
          agentProfileTab={agentProfileTab}
          agentRunResult={props.agentRunResult}
          allowedPermissionCount={props.allowedPermissionCount}
          approvalPlainSentence={props.approvalPlainSentence}
          approvalReason={props.approvalReason}
          approvedContinuation={props.approvedContinuation}
          chatInput={props.chatInput}
          chatTranscript={props.chatTranscript}
          continueApprovedAction={props.continueApprovedAction}
          decideHitl={props.decideHitl}
          decidingApprovalId={props.decidingApprovalId}
          friendlyDate={props.friendlyDate}
          friendlyLogText={props.friendlyLogText}
          agentNextStep={props.agentNextStep}
          isAgentRunning={props.isAgentRunning}
          isConversationLoading={props.isConversationLoading}
          lastFailedPrompt={props.lastFailedPrompt}
          permissionReview={props.permissionReview}
          promptPreview={props.promptPreview}
          readiness={readiness}
          runAgentChat={props.runAgentChat}
          runSummary={props.runSummary}
          scrollToClearance={props.scrollToClearance}
          selectedAgent={selectedAgent}
          selectedAgentApprovals={props.selectedAgentApprovals}
          selectedAgentLogs={props.selectedAgentLogs}
          selectedReadableInfo={props.selectedReadableInfo}
          selectedRiskyActions={props.selectedRiskyActions}
          setAgentProfileTab={setAgentProfileTab}
          setChatInput={props.setChatInput}
          submitAgentPrompt={props.submitAgentPrompt}
          suggestedPrompts={props.suggestedPrompts}
        />

        {agentProfileTab === "permissions" ? (
          <AgentPermissionsTab
            allowedPermissionCount={props.allowedPermissionCount}
            grantAllRequestedSchemas={props.grantAllRequestedSchemas}
            grantingSchemaName={props.grantingSchemaName}
            grantRequestedSchema={props.grantRequestedSchema}
            permissionReview={props.permissionReview}
            selectedIsExternal={selectedIsExternal}
            togglePermission={props.togglePermission}
            ungrantedRequestedSchemas={props.ungrantedRequestedSchemas}
          />
        ) : null}

        {agentProfileTab === "activity" ? (
          <AgentActivityTab
            friendlyDate={props.friendlyDate}
            friendlyLogDetail={props.friendlyLogDetail}
            friendlyLogText={props.friendlyLogText}
            selectedAgentLogs={props.selectedAgentLogs}
          />
        ) : null}

        {agentProfileTab === "settings" ? (
          <AgentSettingsTab
            externalHost={externalHost}
            friendlyTrustLabel={props.friendlyTrustLabel}
            removeAgentFromProfile={props.removeAgentFromProfile}
            revokeSelectedAgentAccess={props.revokeSelectedAgentAccess}
            runVaultSearch={props.runVaultSearch}
            selectedAgent={selectedAgent}
            selectedIsExternal={selectedIsExternal}
            setAgentProfileTab={setAgentProfileTab}
            sourceLabel={sourceLabel}
            triggerHighRiskAction={props.triggerHighRiskAction}
            verificationLabel={verificationLabel}
          />
        ) : null}
      </div>
    </div>
  );
}
