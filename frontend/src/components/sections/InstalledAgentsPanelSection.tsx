import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { InstalledAgentsSection } from "./InstalledAgentsSection";

export function InstalledAgentsPanelSection({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    agents,
    canUseCreatorTools,
    agentSearch,
    agentStatusFilter,
    agentStatusFilters,
    agentSummary,
    hiddenTestAgentCount,
    hideTestAgents,
    isAgentAddOpen,
    isAgentFiltersOpen,
    isMobileAgentDetailOpen,
    mobileInstalledAgentCards,
    openAgentWizard,
    openMarketplace,
    pinnedAgentIds,
    scrollToSection,
    sectionClass,
    selectedAgent,
    setAgentProfileTab,
    setAgentSearch,
    setAgentStatusFilter,
    setHideTestAgents,
    setIsAgentAddOpen,
    setIsAgentFiltersOpen,
    setMobileAgentDetailOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleInstalledAgentCards
  } = props;

  return (
    <InstalledAgentsSection
      activeMobileClass={activeMobileClass}
      agents={agents}
      canUseCreatorTools={canUseCreatorTools}
      agentSearch={agentSearch}
      agentStatusFilter={agentStatusFilter}
      agentStatusFilters={agentStatusFilters}
      agentSummary={agentSummary}
      hiddenTestAgentCount={hiddenTestAgentCount}
      hideTestAgents={hideTestAgents}
      isAgentAddOpen={isAgentAddOpen}
      isAgentFiltersOpen={isAgentFiltersOpen}
      isMobileAgentDetailOpen={isMobileAgentDetailOpen}
      mobileInstalledAgentCards={mobileInstalledAgentCards}
      openAgentWizard={openAgentWizard}
      openMarketplace={openMarketplace}
      pinnedAgentIds={pinnedAgentIds}
      scrollToSection={scrollToSection}
      sectionClass={sectionClass}
      selectedAgent={selectedAgent}
      setAgentProfileTab={setAgentProfileTab}
      setAgentSearch={setAgentSearch}
      setAgentStatusFilter={setAgentStatusFilter}
      setHideTestAgents={setHideTestAgents}
      setIsAgentAddOpen={setIsAgentAddOpen}
      setIsAgentFiltersOpen={setIsAgentFiltersOpen}
      setMobileAgentDetailOpen={setMobileAgentDetailOpen}
      setSelectedAgentId={setSelectedAgentId}
      togglePinnedAgent={togglePinnedAgent}
      visibleInstalledAgentCards={visibleInstalledAgentCards}
    />
  );
}
