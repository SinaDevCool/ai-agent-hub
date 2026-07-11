import { type FormEvent, useState } from "react";
import { Download, Link, RotateCcw, ShieldCheck } from "lucide-react";
import type { ExternalAgentImportInput, ExternalAgentImportPreview } from "../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "../lib/display";
import { StatusPill } from "./StatusPill";

type ExternalAgentImportPanelProps = {
  categoryOptions: string[];
  error: string;
  formatError: (error: unknown) => string;
  isSaving: boolean;
  onImport: (input: ExternalAgentImportInput) => Promise<boolean>;
  onPreview: (input: ExternalAgentImportInput) => Promise<ExternalAgentImportPreview | null>;
  preview: ExternalAgentImportPreview | null;
};

const initialInput: ExternalAgentImportInput = {
  sourceType: "mcp_server",
  endpointUrl: "",
  displayName: "",
  category: "Custom"
};

function verificationTone(preview: ExternalAgentImportPreview) {
  return preview.canInstall ? "green" : "red";
}

export function ExternalAgentImportPanel(props: ExternalAgentImportPanelProps) {
  const [input, setInput] = useState<ExternalAgentImportInput>(initialInput);

  function updateInput(next: Partial<ExternalAgentImportInput>) {
    setInput((current) => ({ ...current, ...next }));
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onPreview({
      ...input,
      endpointUrl: input.endpointUrl.trim(),
      displayName: input.displayName?.trim() || undefined
    });
  }

  async function importPreview() {
    const didImport = await props.onImport({
      sourceType: props.preview?.sourceType ?? input.sourceType,
      endpointUrl: input.endpointUrl.trim(),
      displayName: props.preview?.displayName || input.displayName?.trim() || undefined,
      category: props.preview?.category ?? input.category
    });
    if (didImport) setInput(initialInput);
  }

  const preview = props.preview;
  const manifest = preview?.capabilityManifest;

  return (
    <section className="external-import-panel" aria-label="Import external helper">
      <div className="external-import-copy">
        <div className="panel-title">Import External Helper</div>
        <p>Bring in a helper from another platform. AI Agent Hub reviews the endpoint first and keeps it restricted after import.</p>
      </div>

      <form className="external-import-form" onSubmit={(event) => void submitPreview(event)}>
        <div className="segmented-control" aria-label="External helper source">
          <button
            className={input.sourceType === "mcp_server" ? "selected" : ""}
            onClick={() => updateInput({ sourceType: "mcp_server" })}
            type="button"
          >
            MCP
          </button>
          <button
            className={input.sourceType === "openapi_endpoint" ? "selected" : ""}
            onClick={() => updateInput({ sourceType: "openapi_endpoint" })}
            type="button"
          >
            OpenAPI
          </button>
        </div>
        <label>
          <span>Helper endpoint</span>
          <div className="search-input-wrap">
            <Link size={16} />
            <input
              autoComplete="off"
              name="external-helper-url"
              onChange={(event) => updateInput({ endpointUrl: event.currentTarget.value })}
              placeholder="https://example.com/agent"
              required
              type="url"
              value={input.endpointUrl}
            />
          </div>
        </label>
        <label>
          <span>Name it</span>
          <input
            autoComplete="off"
            name="external-helper-name"
            onChange={(event) => updateInput({ displayName: event.currentTarget.value })}
            placeholder="Optional"
            value={input.displayName ?? ""}
          />
        </label>
        <label>
          <span>Need</span>
          <select
            autoComplete="off"
            name="external-helper-category"
            onChange={(event) => updateInput({ category: event.currentTarget.value })}
            value={input.category}
          >
            {props.categoryOptions.filter((category) => category !== "All").map((category) => (
              <option key={category} value={category}>{friendlyCategoryName(category)}</option>
            ))}
          </select>
        </label>
        <button className="primary-action" disabled={props.isSaving} type="submit">
          <ShieldCheck size={16} /> {props.isSaving ? "Reviewing…" : "Review helper"}
        </button>
      </form>

      {props.error ? <p className="error-text" role="status">{props.formatError(props.error)}</p> : null}

      {preview ? (
        <article className={preview.canInstall ? "external-import-review" : "external-import-review blocked"}>
          <div className="external-import-review-header">
            <div>
              <strong>{preview.displayName}</strong>
              <span>{preview.sourceLabel} from {preview.endpointHost || "blocked endpoint"}</span>
            </div>
            <StatusPill tone={verificationTone(preview)}>{preview.canInstall ? "Safety reviewed" : "Blocked"}</StatusPill>
          </div>

          <div className="manifest-grid compact-manifest-grid">
            <div><strong>Source</strong><span>{preview.sourceLabel}</span></div>
            <div><strong>Host</strong><span>{preview.endpointHost || "Not available"}</span></div>
            <div><strong>Can help with</strong><span>{manifest?.description ?? "External helper tasks"}</span></div>
            <div><strong>Can do</strong><span>{friendlyList(manifest?.tools?.map(friendlyToolName) ?? [], "Simple tasks")}</span></div>
            <div><strong>May ask to read</strong><span>{friendlyList(manifest?.requestedSchemas ?? [], "No private info declared")}</span></div>
            <div><strong>Must ask before</strong><span>{friendlyList(manifest?.highRiskActions?.map(friendlyActionName) ?? [], "No risky actions declared")}</span></div>
          </div>

          {preview.blockers.length ? (
            <div className="external-import-blockers">
              <strong>Needs a different endpoint</strong>
              {preview.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}
            </div>
          ) : null}

          {preview.warnings.length ? (
            <div className="external-import-warnings">
              {preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          ) : null}

          <div className="external-import-actions">
            <button className="primary-action" disabled={!preview.canInstall || props.isSaving} onClick={() => void importPreview()} type="button">
              <Download size={16} /> {props.isSaving ? "Adding…" : "Add helper"}
            </button>
            <button onClick={() => void props.onPreview(input)} type="button"><RotateCcw size={16} /> Review again</button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
