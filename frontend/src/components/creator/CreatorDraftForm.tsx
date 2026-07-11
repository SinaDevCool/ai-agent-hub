import { Link, Save } from "lucide-react";
import type { FormEvent } from "react";
import type { CreatorAgent, VaultSchema } from "../../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "../../lib/display";
import { StatusPill } from "../StatusPill";
import type { CreatorFormState } from "./creatorForm";
import { previewList, sourceLabel, splitLines } from "./creatorForm";

type CreatorDraftFormProps = {
  categoryOptions: string[];
  editingAgent: CreatorAgent | null;
  form: CreatorFormState;
  isEditingReturnedDraft: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  readiness: ReturnType<typeof import("./creatorForm").readinessFor>;
  schemas: VaultSchema[];
  toolOptions: string[];
  toggleListValue: (values: string[], value: string) => string[];
  updateForm: (next: Partial<CreatorFormState>) => void;
};

export function CreatorDraftForm(props: CreatorDraftFormProps) {
  const {
    categoryOptions,
    editingAgent,
    form,
    isEditingReturnedDraft,
    isSaving,
    onCancel,
    onSubmit,
    readiness,
    schemas,
    toolOptions,
    toggleListValue,
    updateForm
  } = props;

  return (
    <form className="creator-form" data-testid="creator-agent-form" onSubmit={(event) => void onSubmit(event)}>
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">{editingAgent ? "Edit Draft" : "New Agent"}</div>
          <p className="mobile-section-intro">Keep the listing clear. People should know what the agent does before they install it.</p>
        </div>
        <StatusPill tone={readiness.ready ? "green" : "amber"}>{readiness.ready ? "ready" : "needs details"}</StatusPill>
      </div>

      {isEditingReturnedDraft ? (
        <div className="moderation-note creator-form-review-note" data-testid="creator-form-review-note">
          <span>Review note: {editingAgent?.moderationNote}</span>
        </div>
      ) : null}

      <div className="form-grid creator-form-grid">
        <label>
          <span>Agent name</span>
          <input
            autoComplete="off"
            maxLength={100}
            minLength={2}
            name="creator-agent-name"
            onChange={(event) => updateForm({ name: event.currentTarget.value })}
            placeholder="Weekend Trip Planner"
            required
            value={form.name}
          />
        </label>
        <label>
          <span>Category</span>
          <select autoComplete="off" name="creator-agent-category" onChange={(event) => updateForm({ category: event.currentTarget.value })} value={form.category}>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="wide-field">
          <span>One-line benefit</span>
          <input
            autoComplete="off"
            maxLength={180}
            minLength={8}
            name="creator-agent-tagline"
            onChange={(event) => updateForm({ tagline: event.currentTarget.value })}
            placeholder="Plans low-stress weekend trips and asks before booking anything."
            required
            value={form.tagline}
          />
        </label>
        <label className="wide-field">
          <span>What does it help with?</span>
          <textarea
            autoComplete="off"
            maxLength={1000}
            minLength={20}
            name="creator-agent-description"
            onChange={(event) => updateForm({ description: event.currentTarget.value })}
            placeholder="Describe what the agent does, what kind of user it is for, and when it will ask permission."
            required
            rows={4}
            value={form.description}
          />
        </label>
      </div>

      <div className="external-source-panel">
        <div>
          <strong><Link size={16} /> Where is this agent built?</strong>
          <span>Imported agents must be reviewed before they appear in marketplace search.</span>
        </div>
        <label>
          <span>Source</span>
          <select
            autoComplete="off"
            name="creator-agent-source"
            onChange={(event) => {
              const sourceType = event.currentTarget.value as CreatorFormState["sourceType"];
              updateForm({
                sourceType,
                apiProtocol: sourceType === "openapi_endpoint" ? "OpenAPI" : "MCP",
                tools: sourceType === "native" ? form.tools : Array.from(new Set([...form.tools, sourceType === "openapi_endpoint" ? "web.fetch" : "vault.search"]))
              });
            }}
            value={form.sourceType}
          >
            <option value="native">Built in AI Agent Hub</option>
            <option value="mcp_server">External MCP server</option>
            <option value="openapi_endpoint">External OpenAPI endpoint</option>
          </select>
        </label>
        <label>
          <span>Endpoint or spec URL</span>
          <input
            autoComplete="url"
            disabled={form.sourceType === "native"}
            name="creator-agent-endpoint"
            onChange={(event) => updateForm({ externalEndpointUrl: event.currentTarget.value })}
            placeholder={form.sourceType === "native" ? "Not needed for native agents" : "https://example.com/agent"}
            required={form.sourceType !== "native"}
            type="url"
            value={form.externalEndpointUrl}
          />
        </label>
      </div>

      <div className="choice-grid creator-choice-grid">
        <fieldset>
          <legend>May ask to read</legend>
          {schemas.length ? schemas.map((schema) => (
            <label className="choice-row" key={schema.id}>
              <input
                checked={form.requestedSchemas.includes(schema.name)}
                onChange={() => updateForm({ requestedSchemas: toggleListValue(form.requestedSchemas, schema.name) })}
                type="checkbox"
              />
              <span>{schema.name}</span>
            </label>
          )) : <p className="empty">No private info categories yet.</p>}
        </fieldset>
        <fieldset>
          <legend>Can do</legend>
          {toolOptions.map((tool) => (
            <label className="choice-row" key={tool}>
              <input
                checked={form.tools.includes(tool)}
                onChange={() => updateForm({ tools: toggleListValue(form.tools, tool) })}
                type="checkbox"
              />
              <span>{friendlyToolName(tool)}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="form-grid creator-form-grid">
        <label className="wide-field">
          <span>Example prompts</span>
          <textarea
            autoComplete="off"
            name="creator-agent-prompts"
            onChange={(event) => updateForm({ examplePromptsText: event.currentTarget.value })}
            placeholder={"Plan a 3-day Lisbon trip under $900\nCompare two hotels for a family weekend"}
            required
            rows={3}
            value={form.examplePromptsText}
          />
        </label>
        <label className="wide-field">
          <span>Why should people trust it?</span>
          <textarea
            autoComplete="off"
            name="creator-agent-trust"
            onChange={(event) => updateForm({ trustReasonsText: event.currentTarget.value })}
            placeholder={"Explains what it needs before asking for access\nPauses before purchases, bookings, or sharing private info"}
            required
            rows={3}
            value={form.trustReasonsText}
          />
        </label>
        <label className="wide-field">
          <span>Always ask before</span>
          <textarea
            autoComplete="off"
            name="creator-agent-approval-rules"
            onChange={(event) => updateForm({ highRiskActionsText: event.currentTarget.value })}
            placeholder="Booking travel, sending email, buying items"
            rows={3}
            value={form.highRiskActionsText}
          />
        </label>
      </div>

      <div className="publish-checklist" aria-label="Publishing readiness">
        {readiness.checks.map((check) => (
          <span className={check.passed ? "passed" : ""} key={check.label}>{check.label}</span>
        ))}
      </div>
      {readiness.missingRequired.length || readiness.reviewItems.length ? (
        <div className="creator-readiness-guidance" aria-label="What to improve before publishing">
          {readiness.missingRequired.slice(0, 3).map((check) => <span key={check.label}>{check.guidance}</span>)}
          {!readiness.missingRequired.length ? readiness.reviewItems.slice(0, 2).map((check) => <span key={check.label}>{check.guidance}</span>) : null}
        </div>
      ) : null}

      <div className="creator-preview-card" aria-label="Marketplace preview">
        <div className="creator-preview-heading">
          <div>
            <strong>{form.name.trim() || "Agent name"}</strong>
            <span>{friendlyCategoryName(form.category)} agent preview</span>
          </div>
          <StatusPill tone={readiness.score >= 80 ? "green" : "amber"}>{readiness.score}% quality</StatusPill>
        </div>
        <p>{form.tagline.trim() || "One clear sentence about who this helps and why."}</p>
        <div className="creator-preview-grid">
          <div><strong>Source</strong><span>{sourceLabel(form.sourceType)}</span></div>
          <div><strong>Good for</strong><span>{form.description.trim() || "Describe the real-life task this agent handles."}</span></div>
          <div><strong>May ask to read</strong><span>{friendlyList(form.requestedSchemas, "No private info")}</span></div>
          <div><strong>Will ask before</strong><span>{friendlyList(splitLines(form.highRiskActionsText).map(friendlyActionName), "No risky actions listed")}</span></div>
        </div>
        <div className="example-prompt-list compact-preview-list">
          <strong>Example prompts</strong>
          {previewList(form.examplePromptsText, "Add at least one prompt a normal person would try.").map((prompt) => <span key={prompt}>{prompt}</span>)}
        </div>
      </div>

      <div className="button-row">
        <button data-testid="creator-save-draft" disabled={isSaving} type="submit"><Save size={16} /> {isSaving ? "Saving…" : "Save draft"}</button>
        <button onClick={onCancel} type="button">Cancel</button>
      </div>
    </form>
  );
}
