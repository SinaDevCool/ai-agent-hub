import { useCallback, useEffect, useState } from "react";
import {
  getLocalAiPrivacyMode,
  getLocalAiDownloadProgress,
  formatLocalAiError,
  getLocalAiStatus,
  installLocalModel,
  removeLocalModel,
  openLocalModelFolder,
  setLocalAiPrivacyMode,
  testLocalModel,
  type LocalAiPrivacyMode,
  type LocalAiDownloadProgress,
  type LocalAiStatus
} from "../lib/localAiBridge";

export function useLocalAi() {
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [privacyMode, setPrivacyModeState] = useState<LocalAiPrivacyMode>(() => getLocalAiPrivacyMode());
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [operation, setOperation] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<LocalAiDownloadProgress | null>(null);

  const refresh = useCallback(async () => {
    const next = await getLocalAiStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function setPrivacyMode(mode: LocalAiPrivacyMode) {
    setLocalAiPrivacyMode(mode);
    setPrivacyModeState(mode);
  }

  async function run(input: {
    action: () => Promise<LocalAiStatus | { message: string }>;
    operation: string;
    successMessage?: string;
    trackDownload?: boolean;
  }) {
    setIsBusy(true);
    setMessage("");
    setError("");
    setOperation(input.operation);
    setDownloadProgress(null);
    const progressTimer = input.trackDownload ? window.setInterval(() => {
      void getLocalAiDownloadProgress().then((progress) => {
        if (progress) setDownloadProgress(progress);
      }).catch(() => undefined);
    }, 400) : null;
    try {
      const result = await input.action();
      setMessage(input.successMessage ?? result.message);
      await refresh();
    } catch (error) {
      setError(formatLocalAiError(error));
    } finally {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      setIsBusy(false);
      setOperation("");
      setDownloadProgress(null);
    }
  }

  return {
    status,
    privacyMode,
    isBusy,
    message,
    error,
    operation,
    downloadProgress,
    refresh,
    setPrivacyMode,
    install: (modelId: string) => run({
      action: () => installLocalModel(modelId),
      operation: modelId === "nomic-embed-v2-moe-q4" ? "Downloading and verifying the retrieval model…" : "Downloading and verifying the language model…",
      successMessage: modelId === "nomic-embed-v2-moe-q4" ? "Multilingual retrieval model installed and verified." : "Language model installed and verified.",
      trackDownload: true
    }),
    remove: (modelId: string) => run({
      action: () => removeLocalModel(modelId),
      operation: "Stopping the model and removing its local file…",
      successMessage: modelId === status?.embeddingModelId ? "Retrieval model removed from this device." : "Language model removed from this device."
    }),
    test: () => run({ action: testLocalModel, operation: "Starting the model and running a private test…" }),
    openFolder: () => run({ action: openLocalModelFolder, operation: "Opening the model folder…" })
  };
}
