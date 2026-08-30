import type { InterpretationResult } from "../agentInterpretationSchema.js";
import { getEmailDraftInput, getRuntimeIntent } from "../runtimeIntentService.js";
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
    calendar_free_time: ["calendar.free_time", "calendar.availability"],
    document_search: ["drive.search", "document.search", "vault.search"],
    blocked: []
  };
  return tools.find((tool) => preferences[intent].some((candidate) => tool.toLowerCase().includes(candidate))) ?? null;
}

export function interpretWithRules(request: InterpretationRequest): InterpretationResult {
  const intent = getRuntimeIntent(request.message);
  const arguments_: Record<string, unknown> = {};
  if (intent === "email_draft") Object.assign(arguments_, getEmailDraftInput(request.message));
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

