import type { RuntimeIntent } from "./agentRuntimeTypes.js";

export function getRuntimeIntent(message: string): RuntimeIntent {
  const cleanMessage = message.trim();
  if (!cleanMessage) return "blocked";

  if (/\b(find|search|look up|show)\b.*\b(document|file|drive)\b/i.test(cleanMessage)) return "document_search";
  if (/\b(create|add|schedule)\b.*\b(calendar event|event on (?:my )?calendar)\b/i.test(cleanMessage)) return "action";

  if (/\b(calendar|schedule|meeting|meetings|availability|available|free time|free slot|when am i free|open slot)\b/i.test(cleanMessage)) {
    return "calendar_free_time";
  }
  if (/\b(emails?|gmail|inbox|messages?|mail)\b/i.test(cleanMessage)) {
    if (/\b(draft|write|prepare|reply|respond|compose)\b/i.test(cleanMessage)) return "email_draft";
    if (/\b(send|sent)\b/i.test(cleanMessage) && !/\b(draft|prepare)\b/i.test(cleanMessage)) return "action";
    return "email_search";
  }
  if (/\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open)\b/i.test(message)) return "action";
  return "search";
}

export function getDriveSearchQuery(message: string) {
  return message.replace(/\b(find|search|look up|show|my|the|document|documents|file|files|in|google|drive)\b/gi, " ").replace(/\s+/g, " ").trim() || "recent";
}

export function getEmailSearchQuery(message: string) {
  return message
    .replace(/\b(search|find|look up|summarize|check|show|get|recent|my|the|emails?|gmail|inbox|messages?|mail)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || "recent";
}

export function getEmailDraftInput(message: string) {
  const toMatch = message.match(/\bto\s+([^\s,;]+@[^\s,;]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const subjectMatch = message.match(/\bsubject\s+["“]?([^"”]+)["”]?/i);
  const bodyMatch = message.match(/\b(?:saying|say|body|message)\s+["“]?([^"”]+)["”]?/i)
    ?? message.match(/\b(?:reply|respond)\s+["“]?([^"”]+)["”]?/i);
  const cleanedBody = bodyMatch?.[1]?.trim()
    || message
      .replace(/\bto\s+([^\s,;]+@[^\s,;]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, " ")
      .replace(/\b(draft|write|prepare|compose|an?|email|reply|respond)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  return {
    to: toMatch?.[1]?.trim(),
    subject: subjectMatch?.[1]?.trim() || "Draft from AI Agent Hub",
    body: cleanedBody
  };
}

export function getCalendarLookupDays(message: string) {
  if (/\btoday\b/i.test(message)) return 1;
  if (/\btomorrow\b/i.test(message)) return 2;
  const dayMatch = message.match(/\b(?:next|in)\s+(\d{1,2})\s+days?\b/i);
  if (dayMatch) return Math.min(Math.max(Number(dayMatch[1]), 1), 30);
  if (/\bmonth\b/i.test(message)) return 30;
  return 7;
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
  const labels: Record<string, string> = {
    book_non_refundable_travel: "book non-refundable travel",
    transfer_funds: "transfer funds",
    open_credit_card: "open a credit card",
    share_medical_record: "share a medical record",
    sign_contract: "sign a contract",
    action_requested: "take this action"
  };
  return labels[action] ?? action.replace(/_/g, " ");
}
