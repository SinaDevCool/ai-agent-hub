import { Bot } from "lucide-react";
import { lazy, Suspense } from "react";
import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { PermissionsPanel } from "../PermissionsPanel";
import { ReceiptsPanel } from "../ReceiptsPanel";
import { VaultPanel } from "../VaultPanel";
import { BetaFeedbackPanel } from "../BetaFeedbackPanel";

const SettingsPanel = lazy(() => import("../SettingsPanel").then((module) => ({ default: module.SettingsPanel })));

export function TrustDataPanels({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    agents,
    approvalPlainSentence,
    approvalReason,
    auth,
    beginEditVaultItem,
    canUseCreatorTools,
    connectors,
    creatorAccess,
    workflows,
    lifePlatform,
    providerConnections,
    decidingApprovalId,
    decideHitl,
    deleteVaultItem,
    documents,
    exportMyData,
    friendlyDate,
    friendlyLogDetail,
    friendlyLogText,
    friendlyNotificationText,
    hitl,
    isSearchingVault,
    logs,
    permissionCenterRows,
    providerReceipts,
    recentLogs,
    recentProviderReceipts,
    requestConfirmation,
    reindexVault,
    revokeAllAgentAccess,
    schemas,
    scrollToSection,
    searchQuery,
    searchResults,
    searchSchemaId,
    searchVault,
    sectionClass,
    selectedAgent,
    setIsAddingVaultItem,
    setSearchQuery,
    setSearchSchemaId,
    togglePermission,
    toolResult,
    ungrantedRequestedSchemas,
    uploadVaultFile,
    visibleApprovals,
    visibleDocuments
  } = props;

  return (
    <>
      <PermissionsPanel
        allowedPermissionCount={props.allowedPermissionCount}
        approvalCount={hitl.length}
        className={`panel clearance-panel mobile-section desktop-section ${activeMobileClass("clearance")} ${sectionClass("clearance")}`}
        onAddPrivateInfo={() => {
          setIsAddingVaultItem(true);
          scrollToSection("vault");
        }}
        onTogglePermission={togglePermission}
        permissionCenterRows={permissionCenterRows}
        selectedAgent={selectedAgent}
        ungrantedRequestedCount={ungrantedRequestedSchemas.length}
      />

      <VaultPanel
        className={`panel vault-panel mobile-section desktop-section ${activeMobileClass("vault")} ${sectionClass("vault")}`}
        documents={documents}
        isSearchingVault={isSearchingVault}
        onAddFirstVaultItem={() => setIsAddingVaultItem(true)}
        onDeleteDocument={deleteVaultItem}
        onEditDocument={beginEditVaultItem}
        onReindexVault={reindexVault}
        onSearchVault={searchVault}
        onToggleAddVaultItem={() => setIsAddingVaultItem((current: boolean) => !current)}
        onUploadVaultFile={uploadVaultFile}
        schemas={schemas}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searchSchemaId={searchSchemaId}
        setSearchQuery={setSearchQuery}
        setSearchSchemaId={setSearchSchemaId}
        visibleDocuments={visibleDocuments}
      />

      <ReceiptsPanel
        className={`panel audit-panel mobile-section desktop-section ${activeMobileClass("activity")} ${sectionClass("activity")}`}
        friendlyDate={friendlyDate}
        friendlyLogDetail={friendlyLogDetail}
        friendlyLogText={friendlyLogText}
        friendlyNotificationText={friendlyNotificationText}
        logsCount={logs.length + providerReceipts.length}
        onUseAgent={() => scrollToSection("helpers")}
        providerReceipts={recentProviderReceipts}
        recentLogs={recentLogs}
      />

      <div className={`panel hitl-panel mobile-section desktop-section ${activeMobileClass("clearance")} ${sectionClass("clearance")}`}>
        <div className="panel-heading-row approval-heading-row">
          <div>
            <div className="panel-title">Waiting for you</div>
            <p className="mobile-section-intro">Sensitive actions pause here. Nothing continues unless you allow it.</p>
          </div>
          <span className={hitl.length ? "status-pill amber" : "status-pill green"}>{hitl.length ? `${hitl.length} waiting` : "none waiting"}</span>
        </div>
        {hitl.length === 0 ? (
          <div className="friendly-empty-state">
            <strong>Nothing needs your approval right now</strong>
            <p>When an agent wants to spend money, share saved info, or continue a sensitive action, you decide here first.</p>
            <button onClick={() => scrollToSection("helpers")} type="button"><Bot aria-hidden="true" size={16} /> Back to My Agents</button>
          </div>
        ) : visibleApprovals.map((request) => (
          <div className="hitl-row" key={request.id}>
            <strong>{request.agent.name} is waiting</strong>
            <span>{approvalPlainSentence(request.actionName)}</span>
            <small>{approvalReason(request.actionName)} Nothing continues unless you allow it.</small>
            <div className="button-row">
              <button disabled={decidingApprovalId === request.id} onClick={() => void decideHitl(request.id, true)} type="button">
                {decidingApprovalId === request.id ? "Allowing…" : "Allow once"}
              </button>
              <button className="danger" disabled={decidingApprovalId === request.id} onClick={() => void decideHitl(request.id, false)} type="button">
                {decidingApprovalId === request.id ? "Saving…" : "Deny"}
              </button>
            </div>
          </div>
        ))}
        {hitl.length > visibleApprovals.length ? <p className="empty">Showing {visibleApprovals.length} of {hitl.length} approvals. Finish these first to keep review simple.</p> : null}
        <p className="empty">{toolResult}</p>
      </div>

      {props.activeSection === "settings" ? <Suspense fallback={<div className="panel settings-panel"><p role="status">Loading settings…</p></div>}><SettingsPanel
        activityCount={logs.length}
        canUseCreatorTools={canUseCreatorTools}
        className={`panel settings-panel mobile-section desktop-section ${activeMobileClass("settings")} ${sectionClass("settings")}`}
        creatorAccessError={creatorAccess.error}
        creatorAccessReason={creatorAccess.reason}
        creatorAccessRequest={creatorAccess.request}
        connectedAccounts={connectors.accounts}
        connectorError={connectors.error}
        connectorMessage={connectors.message}
        agentCount={agents.length}
        isConnectorSaving={connectors.isSaving}
        isConnectorServiceAvailable={connectors.isServiceAvailable}
        isCreatorAccessSaving={creatorAccess.isSaving}
        onConnectGoogle={connectors.connectGoogle}
        onConnectMicrosoft={connectors.connectMicrosoft}
        onCreatorAccessReasonChange={creatorAccess.setReason}
        onDisconnectConnector={connectors.disconnectAccount}
        onRefreshConnectors={connectors.refreshConnectors}
        onRequestConfirmation={requestConfirmation}
        onExportData={exportMyData}
        onManageAccess={() => scrollToSection("clearance")}
        onOpenCreator={() => scrollToSection("creator")}
        onRequestCreatorAccess={creatorAccess.submitCreatorAccessRequest}
        onRevokeAllAccess={revokeAllAgentAccess}
        onSignOut={auth.session ? () => void auth.signOut() : undefined}
        privateInfoCount={documents.length}
        userEmail={auth.session?.user.email ?? "Local development user"}
        visibleAgents={agents}
        workflows={workflows}
        lifePlatform={lifePlatform}
        providerConnections={providerConnections}
      />{canUseCreatorTools ? <BetaFeedbackPanel className={`mobile-section desktop-section ${activeMobileClass("settings")} ${sectionClass("settings")}`} /> : null}</Suspense> : null}
    </>
  );
}
