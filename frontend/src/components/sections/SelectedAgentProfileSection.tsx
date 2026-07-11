import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { AgentProfilePanel } from "../AgentProfilePanel";

export function SelectedAgentProfileSection({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    agentConversation,
    agentProfileTab,
    agentRunResult,
    allowedPermissionCount,
    approvalPlainSentence,
    approvalReason,
    approvedContinuation,
    chatInput,
    chatTranscript,
    continueApprovedAction,
    decideHitl,
    decidingApprovalId,
    friendlyDate,
    friendlyLogDetail,
    friendlyLogText,
    friendlyTrustLabel,
    grantAllRequestedSchemas,
    grantingSchemaName,
    grantRequestedSchema,
    agentNextStep,
    isAgentRunning,
    isConversationLoading,
    isMobileAgentDetailOpen,
    lastFailedPrompt,
    permissionReview,
    promptPreview,
    readiness,
    removeAgentFromProfile,
    revokeSelectedAgentAccess,
    runAgentChat,
    runSummary,
    runVaultSearch,
    scrollToSection,
    sectionClass,
    selectedAgent,
    selectedAgentApprovals,
    selectedAgentLogs,
    selectedCannotDoLabel,
    selectedAgentToolsLabel,
    selectedReadableInfo,
    selectedReadableInfoLabel,
    selectedRiskyActions,
    selectedRiskyActionsLabel,
    setAgentProfileTab,
    setChatInput,
    setMobileAgentDetailOpen,
    submitAgentPrompt,
    suggestedPrompts,
    togglePermission,
    triggerHighRiskAction,
    ungrantedRequestedSchemas
  } = props;

  if (!selectedAgent) return null;

  return (
    <AgentProfilePanel
      agentConversation={agentConversation}
      agentProfileTab={agentProfileTab}
      agentRunResult={agentRunResult}
      allowedPermissionCount={allowedPermissionCount}
      approvalPlainSentence={approvalPlainSentence}
      approvalReason={approvalReason}
      approvedContinuation={approvedContinuation}
      chatInput={chatInput}
      chatTranscript={chatTranscript}
      className={`panel detail-panel mobile-section desktop-section ${activeMobileClass("helpers")} ${sectionClass("helpers")} ${isMobileAgentDetailOpen ? "mobile-agent-detail-is-open" : ""}`}
      continueApprovedAction={continueApprovedAction}
      decideHitl={decideHitl}
      decidingApprovalId={decidingApprovalId}
      friendlyDate={friendlyDate}
      friendlyLogDetail={friendlyLogDetail}
      friendlyLogText={friendlyLogText}
      friendlyTrustLabel={friendlyTrustLabel}
      grantAllRequestedSchemas={grantAllRequestedSchemas}
      grantingSchemaName={grantingSchemaName}
      grantRequestedSchema={grantRequestedSchema}
      agentNextStep={agentNextStep}
      isAgentRunning={isAgentRunning}
      isConversationLoading={isConversationLoading}
      lastFailedPrompt={lastFailedPrompt}
      permissionReview={permissionReview}
      promptPreview={promptPreview}
      readiness={readiness}
      removeAgentFromProfile={removeAgentFromProfile}
      revokeSelectedAgentAccess={revokeSelectedAgentAccess}
      runAgentChat={runAgentChat}
      runSummary={runSummary}
      onBackToAgents={() => setMobileAgentDetailOpen(false)}
      runVaultSearch={runVaultSearch}
      scrollToClearance={() => scrollToSection("clearance")}
      selectedAgent={selectedAgent}
      selectedAgentApprovals={selectedAgentApprovals}
      selectedAgentLogs={selectedAgentLogs}
      selectedCannotDoLabel={selectedCannotDoLabel}
      selectedAgentToolsLabel={selectedAgentToolsLabel}
      selectedReadableInfo={selectedReadableInfo}
      selectedReadableInfoLabel={selectedReadableInfoLabel}
      selectedRiskyActions={selectedRiskyActions}
      selectedRiskyActionsLabel={selectedRiskyActionsLabel}
      setAgentProfileTab={setAgentProfileTab}
      setChatInput={setChatInput}
      submitAgentPrompt={submitAgentPrompt}
      suggestedPrompts={suggestedPrompts}
      togglePermission={togglePermission}
      triggerHighRiskAction={triggerHighRiskAction}
      ungrantedRequestedSchemas={ungrantedRequestedSchemas}
    />
  );
}
