import { Cloud, Cpu, Download, FolderOpen, Globe2, HardDrive, Play, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "../../api/client";
import { useLocalAi } from "../../hooks/useLocalAi";

function formatBytes(value?: number) {
  if (value === undefined) return "Not installed";
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatModelName(id: string) {
  if (id === "apertus-8b") return "Apertus 8B";
  if (id === "liquid-lfm2") return "Liquid LFM2";
  return id.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LocalAiSettingsPanel() {
  const localAi = useLocalAi();
  const [cloudRuntime, setCloudRuntime] = useState<{ configured: boolean; model: string; mode: string } | null>(null);
  useEffect(() => {
    void apiGet<{ openAi?: { configured: boolean; model: string }; aiRuntime?: { mode: string } }>("/health")
      .then((health) => setCloudRuntime({ configured: Boolean(health.openAi?.configured), model: health.openAi?.model ?? "Not selected", mode: health.aiRuntime?.mode ?? "rules" }))
      .catch(() => setCloudRuntime(null));
  }, []);
  const installedModel = localAi.status?.modelId;
  const languageModels = localAi.status?.availableModels?.filter((model) => model.role !== "embedding") ?? [];
  const installedLanguageBytes = languageModels.length
    ? languageModels.filter((model) => model.installed).reduce((total, model) => total + model.sizeBytes, 0)
    : localAi.status?.installedBytes ?? 0;
  const totalStorage = installedLanguageBytes + (localAi.status?.embeddingInstalledBytes ?? 0);
  const progressPercent = localAi.downloadProgress?.totalBytes
    ? Math.min(100, Math.round(localAi.downloadProgress.receivedBytes / localAi.downloadProgress.totalBytes * 100))
    : 0;
  return (
    <section className="settings-connector-card ai-runtime-settings" aria-labelledby="local-ai-heading">
      <div>
        <strong id="local-ai-heading"><Cpu size={16} /> AI runtime</strong>
        <span>The web and desktop apps share agents and permissions, but they do not use the same inference runtime.</span>
      </div>
      <div className="runtime-platform-grid">
        <article className="runtime-platform-card">
          <div className="runtime-platform-heading"><Globe2 aria-hidden="true" size={18} /><div><strong>Web app</strong><span>Server-managed</span></div></div>
          <p>Your browser sends requests to the protected agent service. The deterministic planner remains the free default; cloud generation is used only when the operator enables it.</p>
          <dl>
            <div><dt>Active mode</dt><dd>{cloudRuntime?.mode ?? "Checking…"}</dd></div>
            <div><dt>Cloud model</dt><dd>{cloudRuntime?.configured ? cloudRuntime.model : "Not configured"}</dd></div>
          </dl>
          <small><Cloud aria-hidden="true" size={14} /> Recommended hosted path: a small OpenAI model for quality, or Cloudflare Workers AI for a limited free launch allocation. Neither is presented as free unlimited compute.</small>
        </article>
        <article className="runtime-platform-card">
          <div className="runtime-platform-heading"><HardDrive aria-hidden="true" size={18} /><div><strong>Desktop app</strong><span>Runs on this device</span></div></div>
          <p>Downloaded models interpret prompts locally. Only an approved, validated action plan can reach the backend in Local first mode.</p>
          <dl>
            <div><dt>Runtime</dt><dd>{localAi.status?.runtime === "tauri" ? "Desktop available" : "Requires desktop app"}</dd></div>
            <div><dt>Model</dt><dd>{localAi.status?.modelLabel ?? "Not installed"}</dd></div>
          </dl>
          <small><ShieldCheck aria-hidden="true" size={14} /> Model files and raw local prompts stay on this device unless you explicitly choose Cloud assisted.</small>
        </article>
      </div>
      <div className="settings-subsection-heading"><strong>Desktop model controls</strong><span>{localAi.status?.runtime === "tauri" ? "Manage models installed on this computer." : "Open this page in the desktop app to install or test a local model."}</span></div>
      <div className="settings-grid">
        <div><strong>Runtime</strong><span>{localAi.status?.runtime === "tauri" ? "Desktop" : "Browser compatibility"}</span></div>
        <div><strong>Status</strong><span>{localAi.status?.state ?? "Checking…"}</span></div>
        <div><strong>Model</strong><span>{localAi.status?.modelLabel ?? "None"}</span></div>
        <div><strong>Total model storage</strong><span>{formatBytes(totalStorage)}</span></div>
        <div><strong>Retrieval</strong><span>{localAi.status?.embeddingModelLabel ? `${localAi.status.embeddingModelLabel} · preview` : "Not installed"}</span></div>
      </div>
      <label>
        <span>Privacy mode</span>
        <select autoComplete="off" name="local-ai-privacy-mode" onChange={(event) => localAi.setPrivacyMode(event.currentTarget.value as typeof localAi.privacyMode)} value={localAi.privacyMode}>
          <option value="local-only">Local only — external actions disabled</option>
          <option value="local-first">Local first — send only a validated plan</option>
          <option value="cloud-assisted">Cloud assisted — raw prompts may leave this device</option>
        </select>
      </label>
      <small>{localAi.status?.message}</small>
      {languageModels.length ? <div className="local-model-list" aria-label="Available local language models">
        {languageModels.map((model) => <div className="local-model-option" key={model.id}>
          <div><strong>{model.label}</strong><span>{formatBytes(model.sizeBytes)} · {model.role === "quality" ? "Higher quality" : "Faster"}</span></div>
          {model.id === installedModel
            ? <span className="status-pill green">Active</span>
            : model.installed
              ? <div className="local-model-actions"><button disabled={localAi.isBusy} onClick={() => void localAi.select(model.id)} type="button">Use model</button><button disabled={localAi.isBusy} onClick={() => void localAi.remove(model.id)} type="button"><Trash2 size={16} /> Remove</button></div>
              : <button disabled={localAi.isBusy || localAi.status?.runtime !== "tauri"} onClick={() => void localAi.install(model.id)} type="button"><Download size={16} /> Download</button>}
        </div>)}
      </div> : null}
      {localAi.status?.evaluationModels?.length ? <details className="local-model-candidates">
        <summary>Why are other local models not available?</summary>
        <p>Only models that pass license, safety, multilingual, packaging, and agent-plan accuracy checks can be downloaded here.</p>
        <div className="local-model-list" aria-label="Local models under evaluation">
          {localAi.status.evaluationModels.map((model) => <div className="local-model-option is-disabled" key={model.id}>
            <div><strong>{formatModelName(model.id)}</strong><span>{model.reason}</span></div>
            <span className="status-pill">Under evaluation</span>
          </div>)}
        </div>
      </details> : null}
      <details className="local-model-candidates">
        <summary>How local AI is used by agents</summary>
        <p>Each request includes the selected agent’s name, description, tools, capabilities, and risk boundaries. When both language models are installed, simple read-only agents prefer the faster 3B route and complex or action-capable agents prefer the higher-quality 8B route. If only one verified model is installed, every agent safely falls back to it.</p>
        <p>In Local first mode, only the constrained, validated tool plan reaches the backend policy gate. When approved document results return, the routed local model can write the answer on this device.</p>
        <p>The optional embedding model is a preview runtime. On-device document indexing and a local vector store are not enabled yet, so Local only mode cannot currently search your private documents.</p>
      </details>
      {localAi.operation ? <div className="local-ai-operation" role="status" aria-live="polite">
        <strong>{localAi.operation}</strong>
        {localAi.downloadProgress?.totalBytes ? <>
          <progress aria-label="Model download progress" max={100} value={progressPercent} />
          <span>{progressPercent}% · {formatBytes(localAi.downloadProgress.receivedBytes)} of {formatBytes(localAi.downloadProgress.totalBytes)}</span>
        </> : <span>The first model start can take up to two minutes on a CPU-only laptop.</span>}
      </div> : null}
      <div className="settings-primary-actions">
        {!installedModel && !languageModels.length ? (
          <button disabled={localAi.isBusy || localAi.status?.runtime !== "tauri"} onClick={() => void localAi.install(localAi.status?.recommendedModelId ?? "ministral-3-3b-q4")} type="button">
            <Download size={16} /> Download recommended model
          </button>
        ) : (
          <>
            <button disabled={localAi.isBusy} onClick={() => void localAi.test()} type="button"><Play size={16} /> Test model</button>
            {localAi.status?.embeddingModelId
              ? <button disabled={localAi.isBusy} onClick={() => void localAi.remove(localAi.status?.embeddingModelId ?? "")} type="button"><Trash2 size={16} /> Remove retrieval model</button>
              : <button disabled={localAi.isBusy} onClick={() => void localAi.install("nomic-embed-v2-moe-q4")} type="button"><Download size={16} /> Install embedding preview</button>}
            <button disabled={localAi.isBusy} onClick={() => void localAi.remove(installedModel ?? "")} type="button"><Trash2 size={16} /> Remove model</button>
          </>
        )}
        <button disabled={localAi.isBusy || localAi.status?.runtime !== "tauri"} onClick={() => void localAi.openFolder()} type="button"><FolderOpen size={16} /> Open model folder</button>
      </div>
      {localAi.message ? <small className="settings-action-note" role="status">{localAi.message}</small> : null}
      {localAi.error ? <small className="form-error" role="alert">{localAi.error}</small> : null}
      {localAi.status?.modelDirectory ? <small>Stored privately in <code>{localAi.status.modelDirectory}</code>.</small> : null}
      <small>Model downloads are optional and checksummed. Raw-prompt telemetry is off by default.</small>
    </section>
  );
}
