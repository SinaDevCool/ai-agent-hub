import { getConnectorCapability } from "./connectorCapabilityService.js";
import type { NormalizedWorkflowResult, WorkflowResultItem } from "./workflowResultNormalizer.js";

export type NormalizedConnectorResult = {
  status: "ok" | "failed";
  title: string;
  summary: string;
  items: WorkflowResultItem[];
  nextActions: Array<{ label: string; url?: string; value?: string }>;
  receipt: {
    providerId: string;
    providerLabel: string;
    workflowName?: string;
    capabilityKey: string;
    capabilityLabel: string;
    action: string;
    toolRunId: string;
    externalRequestId?: string;
    endpointHost?: string;
  };
};

function text(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function sanitize(value: unknown, maxLength = 600) {
  return text(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function listFromRawResult(rawResult?: Record<string, unknown>) {
  const candidates = [
    rawResult?.items,
    rawResult?.options,
    rawResult?.hotels,
    rawResult?.flights,
    rawResult?.cars,
    rawResult?.results
  ];
  return candidates.find((value): value is unknown[] => Array.isArray(value)) ?? [];
}

function titleForCapability(capabilityKey: string, itemCount: number) {
  if (capabilityKey === "travel.search_hotels") return itemCount ? "Hotel options found" : "Hotel search completed";
  if (capabilityKey === "travel.search_flights") return itemCount ? "Flight options found" : "Flight search completed";
  if (capabilityKey === "travel.search_cars") return itemCount ? "Car rental options found" : "Car rental search completed";
  if (capabilityKey === "finance.review_spending") return "Spending review ready";
  if (capabilityKey === "health.organize_notes") return "Health notes organized";
  if (capabilityKey === "travel.hold_or_book") return "Travel request updated";
  return "";
}

function itemText(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = sanitize(record[key], 280);
    if (value) return value;
  }
  return fallback;
}

function normalizeRawItems(rawResult?: Record<string, unknown>) {
  return listFromRawResult(rawResult).slice(0, 8).map((value, index) => {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : { title: value };
    const metadata = Object.fromEntries(
      Object.entries(record)
        .filter(([, metadataValue]) => typeof metadataValue === "string" || typeof metadataValue === "number" || typeof metadataValue === "boolean")
        .map(([metadataKey, metadataValue]) => [metadataKey, String(metadataValue)])
    );
    return {
      title: itemText(record, ["title", "name", "label"], `Option ${index + 1}`),
      subtitle: itemText(record, ["subtitle", "provider", "location", "airline", "route"]),
      detail: itemText(record, ["detail", "description", "summary", "notes"]),
      price: itemText(record, ["price", "amount", "estimate"]),
      url: itemText(record, ["url", "bookingUrl", "link", "deepLink"]),
      metadata
    };
  });
}

function workflowToConnector(input: {
  workflowResult: NormalizedWorkflowResult;
  providerId: string;
  providerLabel: string;
  action: string;
  toolRunId: string;
}): NormalizedConnectorResult {
  return {
    status: input.workflowResult.status,
    title: input.workflowResult.title,
    summary: input.workflowResult.summary,
    items: input.workflowResult.items,
    nextActions: input.workflowResult.nextActions,
    receipt: {
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      workflowName: input.workflowResult.receipt.workflowName,
      capabilityKey: input.workflowResult.receipt.capabilityKey,
      capabilityLabel: input.workflowResult.receipt.capabilityLabel,
      action: input.action,
      toolRunId: input.toolRunId,
      externalRequestId: input.workflowResult.receipt.externalRequestId,
      endpointHost: input.workflowResult.receipt.endpointHost
    }
  };
}

export function normalizeConnectorResult(input: {
  capabilityKey: string;
  action: string;
  providerId: string;
  providerLabel: string;
  toolRunId: string;
  rawResult?: Record<string, unknown>;
}): NormalizedConnectorResult {
  const workflowResult = input.rawResult?.workflowResult as NormalizedWorkflowResult | undefined;
  if (workflowResult?.receipt) {
    return workflowToConnector({
      workflowResult,
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      action: input.action,
      toolRunId: input.toolRunId
    });
  }

  const capability = getConnectorCapability(input.capabilityKey);
  const capabilityLabel = capability?.label ?? input.capabilityKey;
  const reply = sanitize(input.rawResult?.reply || input.rawResult?.message || input.rawResult?.summary);
  const items = normalizeRawItems(input.rawResult);
  const title = titleForCapability(capability?.canonicalKey ?? input.capabilityKey, items.length);
  return {
    status: "ok",
    title: title || `${capabilityLabel} completed`,
    summary: reply || (items.length ? `I found ${items.length} option${items.length === 1 ? "" : "s"}.` : "The connected provider completed the request."),
    items,
    nextActions: items
      .filter((item) => item.url)
      .slice(0, 2)
      .map((item) => ({ label: `Open ${item.title}`, url: item.url })),
    receipt: {
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: capability?.canonicalKey ?? input.capabilityKey,
      capabilityLabel,
      action: input.action,
      toolRunId: input.toolRunId,
      externalRequestId: text(input.rawResult?.externalRequestId) || undefined,
      endpointHost: text(input.rawResult?.endpointHost) || undefined
    }
  };
}
