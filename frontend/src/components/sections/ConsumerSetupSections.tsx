import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { InstallSuccessPanel } from "../InstallSuccessPanel";
import { AddAgentPanel } from "./AddAgentPanel";
import { AddVaultItemPanel } from "./AddVaultItemPanel";
import { GuidedSetupPanel } from "./GuidedSetupPanel";
import { HomeSection } from "./HomeSection";

export function ConsumerSetupSections({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    activeSection,
    agentDraft,
    agents,
    agentTemplates,
    agentWizardStep,
    applyAgentTemplate,
    canUseCreatorTools,
    categoryOptions,
    cancelVaultItemEdit,
    completeGuidedSetup,
    createAgent,
    createAgentError,
    createVaultItem,
    createVaultItemError,
    editingDocumentId,
    findAnotherAfterInstall,
    friendlyActionName,
    friendlyTrustLabel,
    getStarterInfoPlaceholder,
    guidedAgentName,
    guidedInfoText,
    guidedPrompt,
    guidedSchema,
    guidedSetupError,
    guidedSetupStep,
    guidedTemplate,
    guidedTemplateId,
    guidedTemplates,
    isAddingAgent,
    isAddingVaultItem,
    isCreatingAgent,
    isCreatingVaultItem,
    isGuidedSetupOpen,
    isGuidedSetupSaving,
    openGuidedSetup,
    openMarketplace,
    openMarketplaceForNeed,
    pendingApproval,
    primarySetupLabel,
    recentInstall,
    reviewRecentInstallAccess,
    runPrimarySetupAction,
    saveVaultEdit,
    schemas,
    scrollToSection,
    sectionClass,
    selectedTemplateId,
    setAgentWizardStep,
    setGuidedInfoText,
    setGuidedSetupStep,
    setGuidedTemplateId,
    setIsAddingAgent,
    setIsAddingVaultItem,
    setIsGuidedSetupOpen,
    setRecentInstall,
    setSelectedAgentId,
    setupProgress,
    setupSteps,
    shouldShowOnboarding,
    showSetupProgress,
    toggleListValue,
    toolOptions,
    tryRecentInstallPrompt,
    updateAgentDraft,
    updateVaultItemDraft,
    vaultItemDraft,
    visibleAgents
  } = props;

  return (
    <>
      <HomeSection
        activeSection={activeSection}
        activeMobileClass={activeMobileClass}
        agents={agents}
        canUseCreatorTools={canUseCreatorTools}
        friendlyActionName={friendlyActionName}
        friendlyTrustLabel={friendlyTrustLabel}
        onOpenGuidedSetup={openGuidedSetup}
        openMarketplace={openMarketplace}
        openMarketplaceForNeed={openMarketplaceForNeed}
        pendingApproval={pendingApproval}
        primarySetupLabel={primarySetupLabel}
        runPrimarySetupAction={runPrimarySetupAction}
        scrollToSection={scrollToSection}
        sectionClass={sectionClass}
        setIsAddingVaultItem={setIsAddingVaultItem}
        setSelectedAgentId={setSelectedAgentId}
        setupProgress={setupProgress}
        setupSteps={setupSteps}
        shouldShowOnboarding={shouldShowOnboarding}
        showSetupProgress={showSetupProgress}
        visibleAgents={visibleAgents}
      />

      {isGuidedSetupOpen ? (
        <GuidedSetupPanel
          completeGuidedSetup={completeGuidedSetup}
          friendlyActionName={friendlyActionName}
          getStarterInfoPlaceholder={getStarterInfoPlaceholder}
          guidedAgentName={guidedAgentName}
          guidedInfoText={guidedInfoText}
          guidedPrompt={guidedPrompt}
          guidedSchema={guidedSchema}
          guidedSetupError={guidedSetupError}
          guidedSetupStep={guidedSetupStep}
          guidedTemplate={guidedTemplate}
          guidedTemplateId={guidedTemplateId}
          guidedTemplates={guidedTemplates}
          isGuidedSetupSaving={isGuidedSetupSaving}
          setGuidedInfoText={setGuidedInfoText}
          setGuidedSetupStep={setGuidedSetupStep}
          setGuidedTemplateId={setGuidedTemplateId}
          setIsGuidedSetupOpen={setIsGuidedSetupOpen}
        />
      ) : null}

      {isAddingAgent && activeSection === "helpers" ? (
        <AddAgentPanel
          agentDraft={agentDraft}
          agentTemplates={agentTemplates}
          agentWizardStep={agentWizardStep}
          applyAgentTemplate={applyAgentTemplate}
          categoryOptions={categoryOptions}
          createAgent={createAgent}
          createAgentError={createAgentError}
          isCreatingAgent={isCreatingAgent}
          schemas={schemas}
          selectedTemplateId={selectedTemplateId}
          setAgentWizardStep={setAgentWizardStep}
          setIsAddingAgent={setIsAddingAgent}
          toggleListValue={toggleListValue}
          toolOptions={toolOptions}
          updateAgentDraft={updateAgentDraft}
        />
      ) : null}

      {isAddingVaultItem && activeSection === "vault" ? (
        <AddVaultItemPanel
          cancelVaultItemEdit={cancelVaultItemEdit}
          createVaultItem={createVaultItem}
          createVaultItemError={createVaultItemError}
          editingDocumentId={editingDocumentId}
          isCreatingVaultItem={isCreatingVaultItem}
          saveVaultEdit={saveVaultEdit}
          schemas={schemas}
          updateVaultItemDraft={updateVaultItemDraft}
          vaultItemDraft={vaultItemDraft}
        />
      ) : null}

      {recentInstall ? (
        <InstallSuccessPanel
          install={recentInstall}
          onDismiss={() => setRecentInstall(null)}
          onFindAnother={findAnotherAfterInstall}
          onReviewAccess={reviewRecentInstallAccess}
          onTryPrompt={tryRecentInstallPrompt}
        />
      ) : null}
    </>
  );
}
