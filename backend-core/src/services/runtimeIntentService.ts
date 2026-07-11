import type { RuntimeIntent } from "./agentRuntimeTypes.js";

export function getRuntimeIntent(message: string): RuntimeIntent {
  if (!message.trim()) return "blocked";
  if (/\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open)\b/i.test(message)) return "action";
  return "search";
}

export function getRequestedAction(message: string, highRiskActions: string[]) {
  const normalized = message.toLowerCase();
  const explicitAction = highRiskActions.find((action) => normalized.includes(action.replace(/_/g, " ")));
  if (explicitAction) return explicitAction;
  if (/\btransfer|pay\b/i.test(message)) return "transfer_funds";
  if (/\bbook|reserve|flight|hotel|travel\b/i.test(message)) return "book_non_refundable_travel";
  if (/\bcredit|card|apply|open\b/i.test(message)) return "open_credit_card";
  if (/\bmedical|health|doctor|record\b/i.test(message)) return "share_medical_record";
  if (/\bsign|contract\b/i.test(message)) return "sign_contract";
  return highRiskActions[0] ?? "action_requested";
}

export function friendlyActionName(action: string) {
  return action.replace(/_/g, " ");
}
