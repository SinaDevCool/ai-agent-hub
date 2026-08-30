import type { Agent } from "../api/types";

export type LocalAiPrivacyMode = "local-only" | "local-first" | "cloud-assisted";

export type LocalInterpretation = {
  intent: "search" | "action" | "workflow" | "email_search" | "email_draft" | "calendar_free_time" | "document_search" | "blocked";
  proposedTool: string | null;
  arguments: Record<string, unknown>;
  missingFields: string[];
  requiresClarification: boolean;
  confidence: number;
  language: string;
  riskHints: string[];
};

export type LocalRuntimeProvenance = {
  kind: "desktop-local" | "browser-local" | "rules" | "cloud";
  modelId: string;
  modelVersion: string;
  quantization?: string;
  rulesVersion: string;
};

export type LocalAiStatus = {
  available: boolean;
  runtime: "tauri" | "web";
  state: "ready" | "model_missing" | "starting" | "unavailable" | "error";
  modelId?: string;
  modelLabel?: string;
  modelVersion?: string;
  quantization?: string;
  installedBytes?: number;
  embeddingInstalledBytes?: number;
  embeddingModelId?: string;
  embeddingModelLabel?: string;
  modelDirectory?: string;
  recommendedModelId?: string;
  availableModels?: Array<{
    id: string;
    label: string;
    role: "default" | "quality" | "embedding";
    sizeBytes: number;
    minimumMemoryBytes: number;
    installed: boolean;
  }>;
  evaluationModels?: Array<{
    id: string;
    reason: string;
  }>;
  message: string;
};

export type LocalAiDownloadProgress = {
  modelId: string;
  receivedBytes: number;
  totalBytes: number;
  active: boolean;
};

type TauriInternals = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

const preferenceKey = "ai-agent-hub.local-ai.preference.v1";

export function formatLocalAiError(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return "Local AI could not complete that request. Restart the app and try again.";
}

export function getLocalAiPrivacyMode(): LocalAiPrivacyMode {
  const value = window.localStorage.getItem(preferenceKey);
  return value === "local-only" || value === "local-first" || value === "cloud-assisted" ? value : "local-first";
}

export function setLocalAiPrivacyMode(mode: LocalAiPrivacyMode) {
  window.localStorage.setItem(preferenceKey, mode);
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  if (!window.__TAURI_INTERNALS__) {
    return {
      available: false,
      runtime: "web",
      state: "unavailable",
      message: "Local models require the AI Agent Hub desktop app. This browser uses compatibility mode."
    };
  }
  return window.__TAURI_INTERNALS__.invoke<LocalAiStatus>("local_ai_status");
}

export async function interpretPromptLocally(input: { prompt: string; agent: Agent }) {
  if (getLocalAiPrivacyMode() === "cloud-assisted") return null;
  if (!window.__TAURI_INTERNALS__) return interpretPromptWithBrowserRules(input);
  const response = await window.__TAURI_INTERNALS__.invoke<{
    interpretation: LocalInterpretation;
    clientRuntime: LocalRuntimeProvenance;
  }>("interpret_agent_prompt", {
    request: {
      prompt: input.prompt,
      agentName: input.agent.name,
      agentDescription: input.agent.capabilityManifest.description ?? "",
      tools: input.agent.capabilityManifest.tools ?? [],
      capabilities: input.agent.capabilityManifest.capabilities ?? [],
      highRiskActions: input.agent.capabilityManifest.highRiskActions ?? []
    }
  });
  return response;
}

export function interpretPromptWithBrowserRules(input: { prompt: string; agent: Agent }) {
  const prompt = input.prompt.trim();
  const tools = input.agent.capabilityManifest.tools ?? [];
  const isAppointment = /\b(appointment|appointments|dentist|doctor|clinic|dermatologist|cardiologist|physiotherapist|therapist|optometrist)\b/i.test(prompt);
  const readOnly = /\b(?:do not|don't|never)\b[^.!?]{0,80}\b(?:book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open|change|cancel|delete|create|update)\b/i.test(prompt)
    || /\bsearch only\b/i.test(prompt);
  const action = !readOnly && /\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open|cancel|delete|create|update)\b/i.test(prompt);
  const documentSearch = /\b(find|search|look up|show)\b.*\b(document|file|drive)\b/i.test(prompt);
  const calendarLookup = !action && !isAppointment && /\b(calendar|schedule|meeting|meetings|availability|available|free time|free slot|when am i free|open slot)\b/i.test(prompt);
  const emailRequest = /\b(emails?|gmail|inbox|messages?|mail)\b/i.test(prompt);
  const emailDraft = emailRequest && /\b(draft|write|prepare|reply|respond|compose)\b/i.test(prompt);
  const intent: LocalInterpretation["intent"] = action ? "action"
    : documentSearch ? "document_search"
      : emailDraft ? "email_draft"
        : emailRequest ? "email_search"
          : calendarLookup ? "calendar_free_time"
            : "search";
  const actionName = action
    ? input.agent.capabilityManifest.highRiskActions?.find((candidate) => prompt.toLowerCase().includes(candidate.replace(/_/g, " ").toLowerCase()))
      ?? (/\btransfer|pay\b/i.test(prompt) ? "transfer_funds" : /\bbook|reserve\b/i.test(prompt) ? "book_non_refundable_travel" : /\bcredit|card|open\b/i.test(prompt) ? "open_credit_card" : undefined)
    : undefined;
  const preferredTool = intent === "action" ? "action.execute"
    : intent === "email_search" ? "email.search"
      : intent === "email_draft" ? "email.draft_reply"
        : intent === "calendar_free_time" ? "calendar.find_free_time"
          : intent === "document_search" ? "drive.search"
            : "vault.search";
  const proposedTool = isAppointment && tools.includes("workflow.run")
    ? "workflow.run"
    : tools.includes(preferredTool) ? preferredTool : null;
  const dates = [...prompt.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  const providerId = prompt.match(/\b(?:for|with|at)\s+([a-z0-9][a-z0-9_-]{2,80})(?=\s+(?:from|between|on)\b|[,.]|$)/i)?.[1];
  const specialty = prompt.match(/\b(dentist|dermatologist|cardiologist|physiotherapist|therapist|optometrist|specialist|doctor|clinic)\b/i)?.[1];
  const location = prompt.match(/\b(?:in|near)\s+([A-Za-z][A-Za-z\s-]{1,50}?)(?=\s+(?:on|from|between|for|next|this|with)\b|[,.]|$)/i)?.[1]?.trim();
  const appointmentAvailability = isAppointment && /\b(availability|available|slots?)\b/i.test(prompt);
  const arguments_: Record<string, unknown> = { task: prompt.slice(0, 1200) };
  if (actionName) arguments_.actionName = actionName;
  if (intent === "email_search") arguments_.query = prompt;
  if (intent === "email_draft") Object.assign(arguments_, emailDraftInput(prompt));
  if (intent === "document_search") arguments_.query = prompt;
  if (intent === "calendar_free_time") arguments_.days = calendarDays(prompt);
  if (isAppointment) {
    arguments_.requestType = appointmentAvailability ? "appointment availability" : "appointment provider search";
    if (providerId) arguments_.providerId = providerId;
    if (dates[0]) arguments_.startDate = dates[0];
    if (dates[1]) arguments_.endDate = dates[1];
    else if (dates[0]) arguments_.endDate = dates[0];
    if (specialty) arguments_.specialty = specialty;
    if (location) arguments_.location = location;
  }
  return {
    interpretation: {
      intent,
      proposedTool,
      arguments: arguments_,
      missingFields: [],
      requiresClarification: false,
      confidence: 0.72,
      language: /\b(ich|mein|meine|bitte|termin|buche|suche|finde)\b/i.test(prompt) ? "de" : "en",
      riskHints: action ? ["write_action", "backend_policy_required"] : []
    },
    clientRuntime: { kind: "browser-local" as const, modelId: "browser-rules", modelVersion: "1", rulesVersion: "runtime-rules-v1" }
  };
}

function calendarDays(prompt: string) {
  if (/\btoday\b/i.test(prompt)) return 1;
  if (/\btomorrow\b/i.test(prompt)) return 2;
  const match = prompt.match(/\b(?:next|in)\s+(\d{1,2})\s+days?\b/i);
  if (match) return Math.min(Math.max(Number(match[1]), 1), 30);
  return /\bmonth\b/i.test(prompt) ? 30 : 7;
}

function emailDraftInput(prompt: string) {
  const to = prompt.match(/\bto\s+([^\s,;]+@[^\s,;]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)?.[1]?.trim();
  return { ...(to ? { to } : {}), subject: "Draft from AI Agent Hub", body: prompt };
}

export async function installLocalModel(modelId: string) {
  if (!window.__TAURI_INTERNALS__) throw new Error("Install the desktop app before downloading a local model.");
  return window.__TAURI_INTERNALS__.invoke<LocalAiStatus>("install_local_model", { modelId });
}

export async function getLocalAiDownloadProgress() {
  if (!window.__TAURI_INTERNALS__) return null;
  return window.__TAURI_INTERNALS__.invoke<LocalAiDownloadProgress>("local_ai_download_progress");
}

export async function removeLocalModel(modelId: string) {
  if (!window.__TAURI_INTERNALS__) throw new Error("Local model management is available in the desktop app.");
  return window.__TAURI_INTERNALS__.invoke<LocalAiStatus>("remove_local_model", { modelId });
}

export async function selectLocalModel(modelId: string) {
  if (!window.__TAURI_INTERNALS__) throw new Error("Local model selection is available in the desktop app.");
  return window.__TAURI_INTERNALS__.invoke<LocalAiStatus>("select_local_model", { modelId });
}

export async function testLocalModel() {
  if (!window.__TAURI_INTERNALS__) throw new Error("Local model testing is available in the desktop app.");
  return window.__TAURI_INTERNALS__.invoke<{ ok: boolean; latencyMs: number; message: string }>("test_local_model");
}

export async function openLocalModelFolder() {
  if (!window.__TAURI_INTERNALS__) throw new Error("The model folder is available in the desktop app.");
  await window.__TAURI_INTERNALS__.invoke<void>("open_local_model_folder");
  return { message: "Opened the local model folder." };
}

export async function openExternalUrl(url: string) {
  if (!window.__TAURI_INTERNALS__) {
    window.location.assign(url);
    return;
  }
  await window.__TAURI_INTERNALS__.invoke<void>("open_external_url", { url });
}

export async function generateReplyLocally(input: { task: string; contexts: string[] }) {
  if (!window.__TAURI_INTERNALS__ || getLocalAiPrivacyMode() === "cloud-assisted") return null;
  return window.__TAURI_INTERNALS__.invoke<{ reply: string; clientRuntime: LocalRuntimeProvenance }>("generate_local_reply", {
    request: { task: input.task, contexts: input.contexts }
  });
}

export async function embedTextLocally(text: string) {
  if (!window.__TAURI_INTERNALS__) throw new Error("Local semantic embeddings require the desktop app.");
  return window.__TAURI_INTERNALS__.invoke<{ vector: number[]; modelId: string; modelVersion: string }>("embed_text_locally", { text });
}
