import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { InstalledAgentsPanelSection } from "./InstalledAgentsPanelSection";
import { MarketplaceSection } from "./MarketplaceSection";
import { SelectedAgentProfileSection } from "./SelectedAgentProfileSection";

export function ConsumerMainPanels({ props }: { props: WorkspaceSectionsProps }) {
  return (
    <>
      <MarketplaceSection props={props} />
      <InstalledAgentsPanelSection props={props} />
      <SelectedAgentProfileSection props={props} />
    </>
  );
}
