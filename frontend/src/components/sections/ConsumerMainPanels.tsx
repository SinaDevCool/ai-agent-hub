import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { InstalledHelpersPanelSection } from "./InstalledHelpersPanelSection";
import { MarketplaceSection } from "./MarketplaceSection";
import { SelectedHelperProfileSection } from "./SelectedHelperProfileSection";

export function ConsumerMainPanels({ props }: { props: WorkspaceSectionsProps }) {
  return (
    <>
      <MarketplaceSection props={props} />
      <InstalledHelpersPanelSection props={props} />
      <SelectedHelperProfileSection props={props} />
    </>
  );
}
