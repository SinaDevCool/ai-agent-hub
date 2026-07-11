import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { InstalledHelpersSection } from "./InstalledHelpersSection";

export function InstalledHelpersPanelSection({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    agents,
    canUseCreatorTools,
    helperSearch,
    helperStatusFilter,
    helperStatusFilters,
    helperSummary,
    hiddenTestHelperCount,
    hideTestHelpers,
    isHelperAddOpen,
    isHelperFiltersOpen,
    isMobileHelperDetailOpen,
    mobileInstalledAgentCards,
    openAgentWizard,
    openMarketplace,
    pinnedAgentIds,
    scrollToSection,
    sectionClass,
    selectedAgent,
    setAgentProfileTab,
    setHelperSearch,
    setHelperStatusFilter,
    setHideTestHelpers,
    setIsHelperAddOpen,
    setIsHelperFiltersOpen,
    setMobileHelperDetailOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleInstalledAgentCards
  } = props;

  return (
    <InstalledHelpersSection
      activeMobileClass={activeMobileClass}
      agents={agents}
      canUseCreatorTools={canUseCreatorTools}
      helperSearch={helperSearch}
      helperStatusFilter={helperStatusFilter}
      helperStatusFilters={helperStatusFilters}
      helperSummary={helperSummary}
      hiddenTestHelperCount={hiddenTestHelperCount}
      hideTestHelpers={hideTestHelpers}
      isHelperAddOpen={isHelperAddOpen}
      isHelperFiltersOpen={isHelperFiltersOpen}
      isMobileHelperDetailOpen={isMobileHelperDetailOpen}
      mobileInstalledAgentCards={mobileInstalledAgentCards}
      openAgentWizard={openAgentWizard}
      openMarketplace={openMarketplace}
      pinnedAgentIds={pinnedAgentIds}
      scrollToSection={scrollToSection}
      sectionClass={sectionClass}
      selectedAgent={selectedAgent}
      setAgentProfileTab={setAgentProfileTab}
      setHelperSearch={setHelperSearch}
      setHelperStatusFilter={setHelperStatusFilter}
      setHideTestHelpers={setHideTestHelpers}
      setIsHelperAddOpen={setIsHelperAddOpen}
      setIsHelperFiltersOpen={setIsHelperFiltersOpen}
      setMobileHelperDetailOpen={setMobileHelperDetailOpen}
      setSelectedAgentId={setSelectedAgentId}
      togglePinnedAgent={togglePinnedAgent}
      visibleInstalledAgentCards={visibleInstalledAgentCards}
    />
  );
}
