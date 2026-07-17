import { prisma } from "../db/prisma.js";
import { decodeJson, encodeJson } from "./jsonService.js";

export type ProviderReceiptStatus = "succeeded" | "blocked" | "waiting_for_approval";

export type CreateProviderReceiptInput = {
  userId: string;
  agentId: string;
  agentRunId?: string;
  toolRunId?: string;
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  action: string;
  status: ProviderReceiptStatus;
  approvalRequired?: boolean;
  hitlRequestId?: string;
  resultQuality?: string;
  userMessage: string;
  technicalMessage?: string;
  retryable?: boolean;
  nextAction?: string;
  itemCount?: number;
  externalRequestId?: string;
  endpointHost?: string;
  metadata?: Record<string, unknown>;
};

export type ListProviderReceiptsInput = {
  userId: string;
  agentId?: string;
  capabilityKey?: string;
  status?: string;
  limit?: number;
};

export type SerializedProviderReceipt = ReturnType<typeof serializeProviderReceipt>;

const actionLabels: Record<string, string> = {
  execute_action: "sensitive action",
  search: "search",
  book_non_refundable_travel: "travel booking",
  hold_or_book: "travel booking",
  find_hotels: "hotel search",
  search_hotels: "hotel search",
  search_flights: "flight search",
  search_cars: "car rental search"
};

const nextActionLabels: Record<string, string> = {
  connect_account: "Connect the provider, then try again.",
  approve_action: "Review it and choose Allow once or Deny.",
  fix_workflow: "Check setup, then try again.",
  grant_access: "Allow the requested saved info, then try again.",
  add_missing_info: "Add the missing details, then try again.",
  try_again: "Try again in a moment.",
  contact_support: "Ask support to check this provider."
};

function cleanText(value: string | undefined, fallback: string, maxLength: number) {
  const text = (value ?? fallback)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\bprovider_error\b/gi, "provider issue")
    .replace(/\bconnector_not_connected\b/gi, "provider not connected")
    .replace(/\bconnector_expired\b/gi, "provider needs reconnecting")
    .replace(/\bbook_non_refundable_travel\b/gi, "travel booking")
    .replace(/\binternal server error\b/gi, "temporary provider issue")
    .replace(/\bworkflow failed\b/gi, "provider task could not finish")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanOptionalText(value: string | undefined, maxLength: number) {
  const cleaned = cleanText(value, "", maxLength);
  return cleaned || undefined;
}

function cleanMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/secret|token|password|authorization|cookie/i.test(key)) continue;
    if (typeof value === "string") safe[key] = cleanText(value, "", 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
  }
  return safe;
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function friendlyAction(action: string) {
  return actionLabels[action] ?? action
    .replace(/^[a-z0-9-]+\./i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function serviceName(input: {
  providerLabel: string;
  endpointHost: string | null;
  metadata: Record<string, unknown>;
}) {
  const workflowName = metadataText(input.metadata, "workflowName");
  if (workflowName) return cleanText(workflowName, "Connected workflow", 120);
  if (input.providerLabel && !/^connected workflow$/i.test(input.providerLabel)) return input.providerLabel;
  if (input.endpointHost) return input.endpointHost;
  return input.providerLabel || "Connected provider";
}

function receiptTitle(input: {
  status: string;
  capabilityLabel: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  const normalizedTitle = metadataText(input.metadata, "title");
  if (input.status === "succeeded" && normalizedTitle && !/_/.test(normalizedTitle)) return normalizedTitle;
  if (input.status === "waiting_for_approval") {
    return `${input.capabilityLabel} needs your approval`;
  }
  if (input.status === "blocked") {
    return `${input.capabilityLabel} could not finish`;
  }
  const action = friendlyAction(input.action);
  if (action && action !== "search") return `${input.capabilityLabel} completed`;
  return `${input.capabilityLabel} completed`;
}

function receiptSummary(input: {
  status: string;
  capabilityLabel: string;
  action: string;
  userMessage: string;
  service: string;
  itemCount: number;
}) {
  if (input.status === "waiting_for_approval") {
    return `${input.capabilityLabel} paused before ${friendlyAction(input.action)}. Nothing happens unless you allow it.`;
  }
  if (input.status === "blocked") {
    return cleanText(input.userMessage, `${input.capabilityLabel} could not continue. Check the connected service and try again.`, 500);
  }
  if (input.itemCount > 0) {
    return `${input.capabilityLabel} found ${input.itemCount} option${input.itemCount === 1 ? "" : "s"} using ${input.service}.`;
  }
  return input.userMessage || `${input.capabilityLabel} completed using ${input.service}.`;
}

function receiptNextStep(input: {
  status: string;
  nextAction: string | null;
  retryable: boolean;
}) {
  if (input.status === "waiting_for_approval") return "Review it and choose Allow once or Deny.";
  if (input.nextAction === "review_options") return "Review the options and ask for a narrower search if needed.";
  if (input.nextAction && nextActionLabels[input.nextAction]) return nextActionLabels[input.nextAction];
  if (input.status === "blocked" && input.retryable) return "Check the connection, then try again.";
  if (input.status === "blocked") return "Review setup or choose another agent.";
  return undefined;
}

export async function createProviderReceipt(input: CreateProviderReceiptInput) {
  let toolRunId = input.toolRunId;
  if (input.toolRunId) {
    const toolRun = await prisma.toolRun.findUnique({ where: { id: input.toolRunId }, select: { id: true } });
    if (toolRun) {
      const existing = await prisma.providerReceipt.findFirst({
        where: {
          toolRunId: input.toolRunId,
          status: input.status,
          hitlRequestId: input.hitlRequestId ?? null
        },
        orderBy: { createdAt: "desc" }
      });
      if (existing) return existing;
    } else {
      toolRunId = undefined;
    }
  }

  return prisma.providerReceipt.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolRunId,
      providerId: cleanText(input.providerId, "provider", 80),
      providerLabel: cleanText(input.providerLabel, "Connected provider", 120),
      capabilityKey: cleanText(input.capabilityKey, "general.research", 120),
      capabilityLabel: cleanText(input.capabilityLabel, "Provider task", 120),
      action: cleanText(input.action, "search", 80),
      status: input.status,
      approvalRequired: Boolean(input.approvalRequired),
      hitlRequestId: input.hitlRequestId,
      resultQuality: cleanOptionalText(input.resultQuality, 40),
      userMessage: cleanText(input.userMessage, "The provider task was recorded.", 700),
      technicalMessage: cleanOptionalText(input.technicalMessage, 700),
      retryable: Boolean(input.retryable),
      nextAction: cleanOptionalText(input.nextAction, 80),
      itemCount: Math.max(0, Math.min(input.itemCount ?? 0, 10_000)),
      externalRequestId: cleanOptionalText(input.externalRequestId, 160),
      endpointHost: cleanOptionalText(input.endpointHost, 200),
      metadata: encodeJson(cleanMetadata(input.metadata))
    }
  });
}

export function serializeProviderReceipt(receipt: {
  id: string;
  agentId: string;
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  action: string;
  status: string;
  approvalRequired: boolean;
  hitlRequestId: string | null;
  resultQuality: string | null;
  userMessage: string;
  retryable: boolean;
  nextAction: string | null;
  itemCount: number;
  externalRequestId: string | null;
  endpointHost: string | null;
  metadata: string;
  createdAt: Date;
  agent?: { name: string } | null;
}) {
  const metadata = decodeJson<Record<string, unknown>>(receipt.metadata, {});
  const service = serviceName({
    providerLabel: receipt.providerLabel,
    endpointHost: receipt.endpointHost,
    metadata
  });
  const badge = receipt.status === "succeeded"
    ? "Done"
    : receipt.status === "waiting_for_approval"
      ? "Waiting for you"
      : "Blocked";
  const title = receiptTitle({
    status: receipt.status,
    capabilityLabel: receipt.capabilityLabel,
    action: receipt.action,
    metadata
  });
  const summary = receiptSummary({
    status: receipt.status,
    capabilityLabel: receipt.capabilityLabel,
    action: receipt.action,
    userMessage: receipt.userMessage,
    service,
    itemCount: receipt.itemCount
  });
  const nextStep = receiptNextStep({
    status: receipt.status,
    nextAction: receipt.nextAction,
    retryable: receipt.retryable
  });
  return {
    id: receipt.id,
    agentId: receipt.agentId,
    agentName: receipt.agent?.name ?? "Agent",
    providerId: receipt.providerId,
    providerLabel: receipt.providerLabel,
    capabilityKey: receipt.capabilityKey,
    capabilityLabel: receipt.capabilityLabel,
    action: receipt.action,
    status: receipt.status,
    approvalRequired: receipt.approvalRequired,
    hitlRequestId: receipt.hitlRequestId,
    resultQuality: receipt.resultQuality,
    userMessage: receipt.userMessage,
    retryable: receipt.retryable,
    nextAction: receipt.nextAction,
    itemCount: receipt.itemCount,
    externalRequestId: receipt.externalRequestId,
    endpointHost: receipt.endpointHost,
    metadata,
    display: {
      title,
      summary,
      badge,
      category: "provider",
      agentName: receipt.agent?.name ?? "Agent",
      externalService: service,
      nextStep,
      itemCount: receipt.itemCount
    },
    createdAt: receipt.createdAt.toISOString()
  };
}

export async function listProviderReceipts(input: ListProviderReceiptsInput) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const receipts = await prisma.providerReceipt.findMany({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      capabilityKey: input.capabilityKey,
      status: input.status
    },
    include: {
      agent: { select: { name: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return receipts.map(serializeProviderReceipt);
}

export async function getProviderReceiptForToolRun(input: { userId: string; toolRunId?: string }) {
  if (!input.toolRunId) return undefined;
  const receipt = await prisma.providerReceipt.findFirst({
    where: {
      userId: input.userId,
      toolRunId: input.toolRunId
    },
    include: {
      agent: { select: { name: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  return receipt ? serializeProviderReceipt(receipt) : undefined;
}
