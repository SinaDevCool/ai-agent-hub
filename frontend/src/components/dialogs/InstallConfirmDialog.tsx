import { ArrowLeft, ArrowRight, Check, Download, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
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
  const [step, setStep] = useState(0);
  const steps = ["Overview", "Access", "Confirm"];
  const requestedSchemas = manifest?.requestedSchemas ?? [];
  const approvalActions = manifest?.highRiskActions ?? [];
  return (
    <div className="confirm-backdrop" role="presentation">
      <section ref={dialogRef} aria-describedby="install-dialog-copy" aria-labelledby="install-dialog-title" aria-modal="true" className="confirm-dialog install-confirm-dialog" role="dialog">
        <div className="panel-title">Add to My Agents</div>
        <h2 id="install-dialog-title">Set up {props.agent.name}</h2>
        <p id="install-dialog-copy">Review what this agent can request before adding it. Access is never granted automatically.</p>
        <ol className="activation-progress" aria-label="Agent setup progress">
          {steps.map((label, index) => <li aria-current={step === index ? "step" : undefined} className={step >= index ? "is-active" : ""} key={label}><span>{step > index ? <Check aria-hidden="true" size={13} /> : index + 1}</span>{label}</li>)}
        </ol>
        {step === 0 ? <div className="activation-step">
          <ShieldCheck aria-hidden="true" size={24} />
          <div><strong>What it helps with</strong><p>{props.agent.tagline || props.agent.description}</p></div>
          <small>After setup, the agent appears in My Agents and starts restricted.</small>
        </div> : null}
        {step === 1 ? <div className="install-review-grid activation-step-grid">
          <div><KeyRound aria-hidden="true" size={18} /><strong>Private data</strong><span>{requestedSchemas.join(", ") || "No private data required"}</span><small>You choose access separately after installation.</small></div>
          <div><ShieldCheck aria-hidden="true" size={18} /><strong>Sensitive actions</strong><span>{approvalActions.map(props.friendlyActionName).join(", ") || "No sensitive actions listed"}</span><small>These actions pause until you approve them.</small></div>
        </div> : null}
        {step === 2 ? <div className="activation-step activation-confirmation">
          <Check aria-hidden="true" size={24} />
          <div><strong>Ready to add</strong><p>{props.agent.name} will be installed without automatically receiving private data or permission to perform sensitive actions.</p></div>
        </div> : null}
        <div className="button-row">
          {step > 0 ? <button disabled={props.installingAgentId === props.agent.id} onClick={() => setStep((current) => current - 1)} type="button"><ArrowLeft aria-hidden="true" size={16} /> Back</button> : null}
          {step < steps.length - 1 ? <button className="primary-action" onClick={() => setStep((current) => current + 1)} type="button">Continue <ArrowRight aria-hidden="true" size={16} /></button> : <button className="primary-action" disabled={props.installingAgentId === props.agent.id} onClick={props.onConfirm} type="button">
            <Download aria-hidden="true" size={16} /> {props.installingAgentId === props.agent.id ? "Adding…" : "Add Agent"}
          </button>}
          <button disabled={props.installingAgentId === props.agent.id} onClick={props.onCancel} type="button">Cancel</button>
        </div>
      </section>
    </div>
  );
}
