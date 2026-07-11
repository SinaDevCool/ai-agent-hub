import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { ExternalAgentImportPanel } from "../ExternalAgentImportPanel";
import { MarketplacePanel } from "../MarketplacePanel";

export function MarketplaceSection({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    addExternalImport,
    applyMarketplaceMatcher,
    canUseCreatorTools,
    categoryOptions,
    clearMarketplaceFilters,
    clearMarketplaceNeedContext,
    externalImportError,
    externalImportPreview,
    friendlyAppError,
    hasInstallableMarketplaceAgent,
    hitl,
    installedAgents,
    installedByDefinitionId,
    installedDefinitionIds,
    installingAgentId,
    isExternalImportSaving,
    isRefreshing,
    marketplaceAgents,
    marketplaceCategory,
    marketplaceCategoryOptions,
    marketplaceError,
    marketplaceExamplePrompts,
    marketplaceFilterLabels,
    marketplaceFilters,
    marketplaceMatchById,
    marketplaceNeedContext,
    marketplaceNeedOptions,
    marketplaceSearch,
    marketplaceTrustReasons,
    matcherActions,
    matcherNeedId,
    matcherPrivateInfo,
    openAgentWizard,
    openMarketplaceDetails,
    permissionProgress,
    prioritizedMarketplaceAgents,
    prioritizedMarketplaceMatches,
    refreshError,
    refreshWithRetry,
    reviewExternalImport,
    schemas,
    scrollToSection,
    sectionClass,
    selectedMarketplaceAgent,
    setAgentProfileTab,
    setConfirmInstallAgent,
    setMarketplaceCategory,
    setMarketplaceError,
    setMarketplaceFilters,
    setMarketplaceSearch,
    setMatcherActions,
    setMatcherNeedId,
    setMatcherPrivateInfo,
    setSelectedAgentId,
    startupRetryMessage,
    visibleMarketplaceAgents
  } = props;

  return (
    <MarketplacePanel
      className={`panel marketplace-panel mobile-section desktop-section ${activeMobileClass("marketplace")} ${sectionClass("marketplace")}`}
      canUseCreatorTools={canUseCreatorTools}
      formatError={friendlyAppError}
      getPermissionProgress={permissionProgress}
      hasInstallableMarketplaceAgent={hasInstallableMarketplaceAgent}
      hitl={hitl}
      installedByDefinitionId={installedByDefinitionId}
      installedCount={installedAgents.length}
      installedDefinitionIds={installedDefinitionIds}
      installingAgentId={installingAgentId}
      isRefreshing={isRefreshing}
      marketplaceAgentCount={marketplaceAgents.length}
      marketplaceCategory={marketplaceCategory}
      marketplaceCategoryOptions={marketplaceCategoryOptions}
      marketplaceError={marketplaceError}
      marketplaceExamplePrompts={marketplaceExamplePrompts}
      marketplaceFilterLabels={marketplaceFilterLabels}
      marketplaceFilters={marketplaceFilters}
      selectedNeedContext={marketplaceNeedContext}
      marketplaceMatchById={marketplaceMatchById}
      marketplaceNeedOptions={marketplaceNeedOptions}
      marketplaceSearch={marketplaceSearch}
      marketplaceTrustReasons={marketplaceTrustReasons}
      matcherActions={matcherActions}
      matcherNeedId={matcherNeedId}
      matcherPrivateInfo={matcherPrivateInfo}
      onApplyMatcher={applyMarketplaceMatcher}
      onBackToAgents={() => scrollToSection("helpers")}
      onClearFilters={clearMarketplaceFilters}
      onClearNeedContext={clearMarketplaceNeedContext}
      onConfirmInstall={setConfirmInstallAgent}
      onCreateCustomAgent={openAgentWizard}
      onEditInstalledAgentAccess={(agentId) => {
        setSelectedAgentId(agentId);
        scrollToSection("clearance");
      }}
      externalImportSlot={(
        <ExternalAgentImportPanel
          categoryOptions={categoryOptions}
          error={externalImportError}
          formatError={friendlyAppError}
          isSaving={isExternalImportSaving}
          onImport={addExternalImport}
          onPreview={reviewExternalImport}
          preview={externalImportPreview}
        />
      )}
      onMarketplaceRetry={() => {
        setMarketplaceError("");
        void refreshWithRetry();
      }}
      onOpenDetails={openMarketplaceDetails}
      onOpenInstalledAgent={(agentId) => {
        setSelectedAgentId(agentId);
        setAgentProfileTab("chat");
        scrollToSection("helpers");
      }}
      onRefresh={() => void refreshWithRetry()}
      prioritizedMarketplaceAgents={prioritizedMarketplaceAgents}
      prioritizedMarketplaceMatches={prioritizedMarketplaceMatches}
      refreshError={refreshError}
      refreshNotice={startupRetryMessage}
      schemas={schemas}
      selectedMarketplaceAgent={selectedMarketplaceAgent}
      setMarketplaceCategory={setMarketplaceCategory}
      setMarketplaceFilters={setMarketplaceFilters}
      setMarketplaceSearch={setMarketplaceSearch}
      setMatcherActions={setMatcherActions}
      setMatcherNeedId={setMatcherNeedId}
      setMatcherPrivateInfo={setMatcherPrivateInfo}
      visibleMarketplaceCount={visibleMarketplaceAgents.length}
    />
  );
}
