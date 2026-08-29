import { Download } from "lucide-react";
import type { MarketplaceAgent } from "../../api/types";
import { useAccessibleDialog } from "../../hooks/useAccessibleDialog";

export function InstallConfirmDialog(props: {
  agent: MarketplaceAgent;
  friendlyActionName: (action: string) => string;
  installingAgentId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useAccessibleDialog(props.onCancel);
  const manifest = props.agent.versions[0]?.capabilityManifest;
  return (
    <div className="confirm-backdrop" role="presentation">
      <section ref={dialogRef} aria-describedby="install-dialog-copy" aria-labelledby="install-dialog-title" aria-modal="true" className="confirm-dialog install-confirm-dialog" role="dialog">
        <div className="panel-title">Add to My Agents</div>
        <h2 id="install-dialog-title">Add {props.agent.name}?</h2>
        <p id="install-dialog-copy">This agent will appear in My Agents. It cannot read private info until you allow it.</p>
        <div className="install-review-grid">
          <div><strong>Best for</strong><span>{props.agent.tagline || props.agent.description}</span></div>
          <div><strong>Needs access to</strong><span>{manifest?.requestedSchemas?.join(", ") || "No private info"}</span></div>
          <div><strong>Always asks before</strong><span>{manifest?.highRiskActions?.map(props.friendlyActionName).join(", ") || "No risky actions listed"}</span></div>
        </div>
        <div className="button-row">
          <button disabled={props.installingAgentId === props.agent.id} onClick={props.onConfirm} type="button">
            <Download size={16} /> {props.installingAgentId === props.agent.id ? "Adding…" : "Add Agent"}
          </button>
          <button disabled={props.installingAgentId === props.agent.id} onClick={props.onCancel} type="button">Cancel</button>
        </div>
      </section>
    </div>
  );
}
