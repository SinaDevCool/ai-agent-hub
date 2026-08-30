import { Cpu, Download, FolderOpen, Play, Trash2 } from "lucide-react";
import { useLocalAi } from "../../hooks/useLocalAi";

function formatBytes(value?: number) {
  if (value === undefined) return "Not installed";
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function LocalAiSettingsPanel() {
  const localAi = useLocalAi();
  const installedModel = localAi.status?.modelId;
  const totalStorage = (localAi.status?.installedBytes ?? 0) + (localAi.status?.embeddingInstalledBytes ?? 0);
  const progressPercent = localAi.downloadProgress?.totalBytes
    ? Math.min(100, Math.round(localAi.downloadProgress.receivedBytes / localAi.downloadProgress.totalBytes * 100))
    : 0;
  const languageModels = localAi.status?.availableModels?.filter((model) => model.role !== "embedding") ?? [];
  return (
    <section className="settings-connector-card" aria-labelledby="local-ai-heading">
      <div>
        <strong id="local-ai-heading"><Cpu size={16} /> Local AI</strong>
        <span>Interpret requests on this device. Provider access, approvals, and external actions remain protected by the backend.</span>
      </div>
      <div className="settings-grid">
        <div><strong>Runtime</strong><span>{localAi.status?.runtime === "tauri" ? "Desktop" : "Browser compatibility"}</span></div>
        <div><strong>Status</strong><span>{localAi.status?.state ?? "Checking…"}</span></div>
        <div><strong>Model</strong><span>{localAi.status?.modelLabel ?? "None"}</span></div>
        <div><strong>Total model storage</strong><span>{formatBytes(totalStorage)}</span></div>
        <div><strong>Retrieval</strong><span>{localAi.status?.embeddingModelLabel ?? "Not installed"}</span></div>
      </div>
      <label>
        <span>Privacy mode</span>
        <select onChange={(event) => localAi.setPrivacyMode(event.currentTarget.value as typeof localAi.privacyMode)} value={localAi.privacyMode}>
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
              ? <button disabled={localAi.isBusy} onClick={() => void localAi.select(model.id)} type="button">Use model</button>
              : <button disabled={localAi.isBusy || localAi.status?.runtime !== "tauri"} onClick={() => void localAi.install(model.id)} type="button"><Download size={16} /> Download</button>}
        </div>)}
      </div> : null}
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
              : <button disabled={localAi.isBusy} onClick={() => void localAi.install("nomic-embed-v2-moe-q4")} type="button"><Download size={16} /> Install multilingual retrieval</button>}
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
