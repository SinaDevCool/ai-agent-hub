import type { InterpretationResult } from "../agentInterpretationSchema.js";
import { getCalendarLookupDays, getDriveSearchQuery, getEmailDraftInput, getEmailSearchQuery, getNormalizedTask, getRuntimeIntent } from "../runtimeIntentService.js";
import type { InterpretationRequest, LanguageModelProvider } from "./languageModelProvider.js";

export const RULES_VERSION = "runtime-rules-v1";

function detectLanguage(message: string) {
  return /\b(ich|mein|meine|bitte|termin|buche|suche|finde|kalender)\b/i.test(message) ? "de" : "en";
}

function inferTool(intent: InterpretationResult["intent"], tools: string[]) {
  const preferences: Record<InterpretationResult["intent"], string[]> = {
    search: ["search", "find", "availability", "vault.search"],
    action: ["action.execute", "reserve", "book", "send", "create", "update"],
    workflow: ["workflow.run"],
    email_search: ["gmail.search", "email.search", "mail.search"],
    email_draft: ["gmail.draft", "email.draft", "mail.draft"],
    calendar_free_time: ["calendar.find_free_time", "calendar.free_time", "calendar.availability"],
    document_search: ["drive.search", "document.search", "vault.search"],
    blocked: []
  };
  return preferences[intent]
    .map((candidate) => tools.find((tool) => tool.toLowerCase().includes(candidate)))
    .find(Boolean) ?? null;
}

export function interpretWithRules(request: InterpretationRequest): InterpretationResult {
  const intent = getRuntimeIntent(request.message);
  const arguments_: Record<string, unknown> = { task: getNormalizedTask(request.message) };
  if (intent === "email_draft") Object.assign(arguments_, getEmailDraftInput(request.message));
  if (intent === "email_search") arguments_.query = getEmailSearchQuery(request.message);
  if (intent === "document_search") arguments_.query = getDriveSearchQuery(request.message);
  if (intent === "calendar_free_time") arguments_.days = getCalendarLookupDays(request.message);
  return {
    intent,
    proposedTool: inferTool(intent, request.manifest.tools ?? []),
    arguments: arguments_,
    missingFields: [],
    requiresClarification: intent === "blocked",
    confidence: intent === "blocked" ? 0 : 0.86,
    language: detectLanguage(request.message),
    riskHints: intent === "action" ? ["write_action", "backend_policy_required"] : []
  };
}

export const rulesLanguageModelProvider: LanguageModelProvider = {
  id: RULES_VERSION,
  executionLocation: "device",
  async interpret(request) {
    return interpretWithRules(request);
  }
};
