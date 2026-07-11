import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Bot } from "lucide-react";
import type { VaultSchema } from "../../api/types";
import { friendlyToolName } from "../../lib/display";
import { parseHighRiskActions, type AgentDraft, type AgentTemplate } from "../../hooks/useAgentWizard";

type AddAgentPanelProps = {
  agentDraft: AgentDraft;
  agentTemplates: AgentTemplate[];
  agentWizardStep: number;
  applyAgentTemplate: (template: AgentTemplate) => void;
  categoryOptions: string[];
  createAgent: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  createAgentError: string;
  isCreatingAgent: boolean;
  schemas: VaultSchema[];
  selectedTemplateId: string;
  setAgentWizardStep: Dispatch<SetStateAction<number>>;
  setIsAddingAgent: (value: boolean) => void;
  toggleListValue: (values: string[], value: string) => string[];
  toolOptions: string[];
  updateAgentDraft: (update: Partial<AgentDraft>) => void;
};

export function AddAgentPanel(props: AddAgentPanelProps) {
  const {
    agentDraft,
    agentTemplates,
    agentWizardStep,
    applyAgentTemplate,
    categoryOptions,
    createAgent,
    createAgentError,
    isCreatingAgent,
    schemas,
    selectedTemplateId,
    setAgentWizardStep,
    setIsAddingAgent,
    toggleListValue,
    toolOptions,
    updateAgentDraft
  } = props;

  return (
    <form className="panel add-agent-panel" onSubmit={(event) => void createAgent(event)}>
      <div className="panel-title">Add an Agent</div>
      <div className="wizard-steps" aria-label="Agent setup progress">
        {[1, 2, 3, 4].map((step) => (
          <button className={agentWizardStep === step ? "step-active" : ""} key={step} onClick={() => setAgentWizardStep(step)} type="button">
            {step}
          </button>
        ))}
      </div>

      {agentWizardStep === 1 ? (
        <section className="wizard-page">
          <h2>What kind of agent do you want?</h2>
          <div className="template-grid">
            {agentTemplates.map((template) => (
              <button
                className={selectedTemplateId === template.id ? "template-card selected" : "template-card"}
                key={template.id}
                onClick={() => applyAgentTemplate(template)}
                type="button"
              >
                <strong>{template.title}</strong>
                <span>{template.summary}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {agentWizardStep === 2 ? (
        <section className="wizard-page">
          <h2>Name and describe it</h2>
          <div className="form-grid consumer-form-grid">
            <label>
              <span>Agent name</span>
              <input
                autoComplete="off"
                maxLength={80}
                name="agent-name"
                onChange={(event) => updateAgentDraft({ name: event.currentTarget.value })}
                placeholder="My Travel Planner"
                required
                value={agentDraft.name}
              />
            </label>
            <label>
              <span>Agent type</span>
              <select autoComplete="off" name="agent-category" onChange={(event) => updateAgentDraft({ category: event.currentTarget.value })} value={agentDraft.category}>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="wide-field">
              <span>What should it help with?</span>
              <textarea
                maxLength={500}
                minLength={10}
                name="agent-description"
                autoComplete="off"
                onChange={(event) => updateAgentDraft({ description: event.currentTarget.value })}
                placeholder="Plans trips using my preferences and asks before booking."
                required
                rows={3}
                value={agentDraft.description}
              />
            </label>
          </div>
        </section>
      ) : null}

      {agentWizardStep === 3 ? (
        <section className="wizard-page">
          <h2>Choose what it can access</h2>
          <div className="choice-grid consumer-choice-grid">
            <fieldset>
              <legend>Private info this agent can request</legend>
              {schemas.map((schema) => (
                <label className="choice-row" key={schema.id}>
                  <input
                    checked={agentDraft.requestedSchemas.includes(schema.name)}
                    onChange={() => updateAgentDraft({ requestedSchemas: toggleListValue(agentDraft.requestedSchemas, schema.name) })}
                    type="checkbox"
                  />
                  <span>{schema.name}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>What it may do</legend>
              {toolOptions.map((tool) => (
                <label className="choice-row" key={tool}>
                  <input
                    checked={agentDraft.tools.includes(tool)}
                    onChange={() => updateAgentDraft({ tools: toggleListValue(agentDraft.tools, tool) })}
                    type="checkbox"
                  />
                  <span>{friendlyToolName(tool)}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>
      ) : null}

      {agentWizardStep === 4 ? (
        <section className="wizard-page">
          <h2>Set approval rules</h2>
          <label className="risk-field">
            <span>Ask me before</span>
            <textarea
              autoComplete="off"
              name="agent-approval-rules"
              onChange={(event) => updateAgentDraft({ highRiskActionsText: event.currentTarget.value })}
              placeholder="Buying, booking, sending, or sharing anything important"
              rows={4}
              value={agentDraft.highRiskActionsText}
            />
          </label>
          <div className="review-strip">
            <div><strong>Connection</strong><span>Starts restricted</span></div>
            <div><strong>Can request</strong><span>{agentDraft.requestedSchemas.length} info categories</span></div>
            <div><strong>Approval rules</strong><span>{parseHighRiskActions(agentDraft.highRiskActionsText).length} rules</span></div>
          </div>
        </section>
      ) : null}

      {createAgentError ? <p className="error-text">{createAgentError}</p> : null}
      <div className="button-row">
        {agentWizardStep > 1 ? <button onClick={() => setAgentWizardStep((step: number) => step - 1)} type="button">Back</button> : null}
        {agentWizardStep < 4 ? <button onClick={() => setAgentWizardStep((step: number) => step + 1)} type="button">Next</button> : null}
        {agentWizardStep === 4 ? (
          <button disabled={isCreatingAgent} type="submit"><Bot size={16} /> {isCreatingAgent ? "Adding…" : "Add agent"}</button>
        ) : null}
        <button onClick={() => setIsAddingAgent(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}
