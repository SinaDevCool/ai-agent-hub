import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { ConsumerMainPanels } from "./ConsumerMainPanels";
import { ConsumerSetupSections } from "./ConsumerSetupSections";
import { CreatorAdminPanels } from "./CreatorAdminPanels";
import { TrustDataPanels } from "./TrustDataPanels";

export function WorkspaceSections(input: { props: WorkspaceSectionsProps }) {
  const { props } = input;

  return (
    <>
      <ConsumerSetupSections props={props} />
      <section className={`grid workspace-grid section-${props.activeSection} ${props.agents.length ? "has-helpers" : "has-no-helpers"}`}>
        <ConsumerMainPanels props={props} />
        <CreatorAdminPanels props={props} />
        <TrustDataPanels props={props} />
      </section>
    </>
  );
}
