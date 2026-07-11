import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Bot } from "lucide-react";
import type { VaultSchema } from "../../api/types";
import type { AgentTemplate } from "../../hooks/useAgentWizard";

type GuidedSetupPanelProps = {
  completeGuidedSetup: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  getStarterInfoPlaceholder: (templateId: string) => string;
  guidedAgentName: string;
  guidedInfoText: string;
  guidedPrompt: string;
  guidedSchema: VaultSchema | undefined;
  guidedSetupError: string;
  guidedSetupStep: number;
  guidedTemplate: AgentTemplate;
  guidedTemplateId: string;
  guidedTemplates: AgentTemplate[];
  isGuidedSetupSaving: boolean;
  setGuidedInfoText: (value: string) => void;
  setGuidedSetupStep: Dispatch<SetStateAction<number>>;
  setGuidedTemplateId: (value: string) => void;
  setIsGuidedSetupOpen: (value: boolean) => void;
  friendlyActionName: (action: string) => string;
};

export function GuidedSetupPanel(props: GuidedSetupPanelProps) {
  const {
    completeGuidedSetup,
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
    isGuidedSetupSaving,
    setGuidedInfoText,
    setGuidedSetupStep,
    setGuidedTemplateId,
    setIsGuidedSetupOpen,
    friendlyActionName
  } = props;

  return (
    <form className="panel guided-setup-panel" onSubmit={(event) => void completeGuidedSetup(event)}>
      <div className="guided-setup-head">
        <div>
          <div className="panel-title">Guided Setup</div>
          <h2>{guidedSetupStep === 1 ? "What should your agent do?" : guidedSetupStep === 2 ? "Add one helpful private note" : "Ready to create your agent"}</h2>
        </div>
        <div className="wizard-steps" aria-label="Guided setup progress">
          {[1, 2, 3].map((step) => (
            <button className={guidedSetupStep === step ? "step-active" : ""} key={step} onClick={() => setGuidedSetupStep(step)} type="button">
              {step}
            </button>
          ))}
        </div>
      </div>

      {guidedSetupStep === 1 ? (
        <section className="wizard-page">
          <div className="template-grid guided-template-grid">
            {guidedTemplates.map((template) => (
              <button
                className={guidedTemplateId === template.id ? "template-card selected" : "template-card"}
                key={template.id}
                onClick={() => setGuidedTemplateId(template.id)}
                type="button"
              >
                <strong>{template.title}</strong>
                <span>{template.summary}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {guidedSetupStep === 2 ? (
        <section className="wizard-page">
          <p className="guided-copy">
            This stays in your Personal Info. Your new agent will still need permission before reading it.
          </p>
          <label className="risk-field">
            <span>{guidedSchema ? `${guidedSchema.name} note` : "Private note"}</span>
            <textarea
              onChange={(event) => setGuidedInfoText(event.currentTarget.value)}
              placeholder={getStarterInfoPlaceholder(guidedTemplate.id)}
              rows={5}
              value={guidedInfoText}
            />
          </label>
        </section>
      ) : null}

      {guidedSetupStep === 3 ? (
        <section className="wizard-page">
          <div className="guided-review">
            <div><strong>Agent</strong><span>{guidedAgentName}</span></div>
            <div><strong>Can request</strong><span>{guidedTemplate.requestedSchemas.join(", ") || "Nothing yet"}</span></div>
            <div><strong>Must ask before</strong><span>{guidedTemplate.highRiskActions.map(friendlyActionName).join(", ") || "No risky actions"}</span></div>
            <div><strong>First thing to try</strong><span>{guidedPrompt}</span></div>
          </div>
          <p className="guided-copy">
            After this, review the permission request. You stay in control before the agent reads private info or continues a risky action.
          </p>
        </section>
      ) : null}

      {guidedSetupError ? <p className="error-text">{guidedSetupError}</p> : null}
      <div className="button-row">
        {guidedSetupStep > 1 ? <button onClick={() => setGuidedSetupStep((step: number) => step - 1)} type="button">Back</button> : null}
        {guidedSetupStep < 3 ? <button onClick={() => setGuidedSetupStep((step: number) => step + 1)} type="button">Next</button> : null}
        {guidedSetupStep === 3 ? (
          <button disabled={isGuidedSetupSaving} type="submit"><Bot size={16} /> {isGuidedSetupSaving ? "Creating…" : "Create agent"}</button>
        ) : null}
        <button onClick={() => setIsGuidedSetupOpen(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}
