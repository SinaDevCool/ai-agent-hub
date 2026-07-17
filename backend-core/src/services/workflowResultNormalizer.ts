import { getWorkflowCapability } from "./workflowCapabilityCatalog.js";

export type WorkflowResultItem = {
  title: string;
  subtitle?: string;
  detail?: string;
  price?: string;
  url?: string;
  metadata?: Record<string, string>;
};

export type WorkflowResultAction = {
  label: string;
  url?: string;
  value?: string;
};

export type NormalizedWorkflowResult = {
  status: "ok" | "failed";
  quality: "complete" | "partial" | "empty" | "malformed";
  title: string;
  summary: string;
  items: WorkflowResultItem[];
  nextActions: WorkflowResultAction[];
  receipt: {
    workflowConnectionId: string;
    workflowName: string;
    capabilityKey: string;
    capabilityLabel: string;
    provider: string;
    endpointHost: string;
    providerStatus?: number;
    externalRequestId?: string;
  };
};

function text(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function cleanText(value: unknown, maxLength = 600) {
  return text(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function arrayFromBody(body: unknown, keys: string[]) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  const result = record.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    for (const key of keys) {
      const value = nested[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function itemFromRecord(value: unknown): WorkflowResultItem | null {
  if (!value || typeof value !== "object") {
    const label = cleanText(value);
    return label ? { title: label } : null;
  }
  const record = value as Record<string, unknown>;
  const title = firstText(record, ["title", "name", "hotel", "flight", "car", "option", "label"]);
  if (!title) return null;
  const url = firstText(record, ["url", "link", "bookingUrl", "booking_url", "deepLink"]);
  const metadata: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (["title", "name", "hotel", "flight", "car", "option", "label", "url", "link", "bookingUrl", "booking_url", "deepLink"].includes(key)) continue;
    const valueText = cleanText(raw, 120);
    if (valueText && Object.keys(metadata).length < 4) metadata[key] = valueText;
  }
  return {
    title: cleanText(title, 160),
    subtitle: firstText(record, ["subtitle", "location", "route", "type", "provider", "airline"]),
    detail: firstText(record, ["detail", "description", "summary", "notes", "snippet"]),
    price: firstText(record, ["price", "total", "cost", "fare", "nightlyRate"]),
    url: url || undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };
}

function getReply(body: unknown) {
  if (typeof body === "string") return cleanText(body);
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const direct = firstText(record, ["reply", "message", "summary", "output"]);
  if (direct) return cleanText(direct);
  const result = record.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    return cleanText(firstText(nested, ["reply", "message", "summary", "content", "output"]));
  }
  return "";
}

function resultTitle(capabilityKey: string, itemCount: number) {
  if (capabilityKey === "travel.search_hotels") return itemCount ? "Hotel options found" : "Hotel search finished";
  if (capabilityKey === "travel.search_flights") return itemCount ? "Flight options found" : "Flight search finished";
  if (capabilityKey === "travel.search_cars") return itemCount ? "Car rental options found" : "Car rental search finished";
  if (capabilityKey === "travel.plan_trip") return "Trip plan ready";
  if (capabilityKey === "email.follow_up") return "Draft follow-up ready";
  if (capabilityKey === "finance.review_spending") return "Spending review ready";
  return "Workflow completed";
}

function defaultSummary(capabilityKey: string, itemCount: number, reply: string) {
  if (reply) return reply;
  if (itemCount > 0) return `I found ${itemCount} option${itemCount === 1 ? "" : "s"} from the connected workflow.`;
  if (capabilityKey === "travel.search_hotels") return "The hotel workflow finished, but did not return a list of stays.";
  if (capabilityKey === "travel.search_flights") return "The flight workflow finished, but did not return a list of flights.";
  return "The connected workflow finished.";
}

function bodyItemKeys(capabilityKey: string) {
  if (capabilityKey === "travel.search_hotels") return ["hotels", "stays", "results", "items", "options"];
  if (capabilityKey === "travel.search_flights") return ["flights", "results", "items", "options"];
  if (capabilityKey === "travel.search_cars") return ["cars", "rentals", "results", "items", "options"];
  return ["results", "items", "options"];
}

function qualityForResult(input: { body: unknown; capabilityKey: string; reply: string; items: WorkflowResultItem[] }) {
  if (!input.body || (typeof input.body !== "object" && typeof input.body !== "string")) return "malformed" as const;
  if (!input.items.length) return input.reply ? "empty" as const : "malformed" as const;
  const hasUsefulDetails = input.items.some((item) => item.subtitle || item.detail || item.price || item.url);
  if (!hasUsefulDetails) return "partial" as const;
  if (input.capabilityKey.startsWith("travel.search_")) {
    const hasTravelDecisionField = input.items.some((item) => item.price || item.url);
    return hasTravelDecisionField ? "complete" as const : "partial" as const;
  }
  return "complete" as const;
}

export function normalizeWorkflowResult(input: {
  body: unknown;
  workflowConnectionId: string;
  workflowName: string;
  capabilityKey: string;
  provider: string;
  endpointHost: string;
  providerStatus?: number;
}): NormalizedWorkflowResult {
  const rawItems = arrayFromBody(input.body, bodyItemKeys(input.capabilityKey));
  const items = rawItems.map(itemFromRecord).filter((item): item is WorkflowResultItem => Boolean(item)).slice(0, 8);
  const reply = getReply(input.body);
  const capability = getWorkflowCapability(input.capabilityKey);
  const capabilityLabel = capability?.label ?? input.capabilityKey;
  const firstUrl = items.find((item) => item.url)?.url;
  const quality = qualityForResult({ body: input.body, capabilityKey: input.capabilityKey, reply, items });
  return {
    status: "ok",
    quality,
    title: resultTitle(input.capabilityKey, items.length),
    summary: defaultSummary(input.capabilityKey, items.length, reply),
    items,
    nextActions: firstUrl ? [{ label: "Open result", url: firstUrl }] : [],
    receipt: {
      workflowConnectionId: input.workflowConnectionId,
      workflowName: input.workflowName,
      capabilityKey: input.capabilityKey,
      capabilityLabel,
      provider: input.provider,
      endpointHost: input.endpointHost,
      providerStatus: input.providerStatus,
      externalRequestId: input.body && typeof input.body === "object" && typeof (input.body as Record<string, unknown>).requestId === "string"
        ? String((input.body as Record<string, unknown>).requestId).slice(0, 120)
        : undefined
    }
  };
}

export function normalizeWorkflowFailure(input: {
  reason: string;
  workflowConnectionId?: string;
  workflowName?: string;
  capabilityKey: string;
  provider?: string;
  endpointHost?: string;
  providerStatus?: number;
}): NormalizedWorkflowResult {
  const capability = getWorkflowCapability(input.capabilityKey);
  const capabilityLabel = capability?.label ?? input.capabilityKey;
  return {
    status: "failed",
    quality: "malformed",
    title: `${capabilityLabel} could not finish`,
    summary: input.reason || "The connected workflow did not respond. You can retry or check the workflow in Settings.",
    items: [],
    nextActions: [{ label: "Retry", value: "retry" }, { label: "Check workflow", value: "settings" }],
    receipt: {
      workflowConnectionId: input.workflowConnectionId ?? "",
      workflowName: input.workflowName ?? "Connected workflow",
      capabilityKey: input.capabilityKey,
      capabilityLabel,
      provider: input.provider ?? "workflow",
      endpointHost: input.endpointHost ?? "",
      providerStatus: input.providerStatus
    }
  };
}
