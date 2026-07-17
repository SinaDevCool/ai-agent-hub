import { setTimeout, clearTimeout } from "node:timers";
import { prisma } from "../db/prisma.js";
import { badRequest, httpError, notFound } from "../errors/httpError.js";
import { env } from "../config/env.js";
import { decodeJson } from "./jsonService.js";
import {
  createSigningSecret,
  decryptWorkflowSecret,
  encryptWorkflowSecret,
  signWorkflowPayload
} from "./cryptoService.js";
import { validateExternalUrl } from "./policy/externalUrlPolicyService.js";
import {
  getWorkflowCapability,
  inferWorkflowCapability,
  listWorkflowCapabilities,
  normalizeWorkflowCapability
} from "./workflowCapabilityCatalog.js";
import { normalizeWorkflowResult } from "./workflowResultNormalizer.js";

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

export function setWorkflowFetchForTest(nextFetch: FetchLike) {
  fetchImpl = nextFetch;
}

export function resetWorkflowFetchForTest() {
  fetchImpl = fetch;
}

type WorkflowStatus = "draft" | "active" | "failed" | "disabled";

type WorkflowRecord = Awaited<ReturnType<typeof prisma.workflowConnection.findFirst>>;

type WorkflowExecutionInput = {
  workflowId?: string;
  userId: string;
  agentId: string;
  agentRunId?: string;
  toolRunId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requireActive?: boolean;
};

function serializeWorkflow(connection: NonNullable<WorkflowRecord>) {
  return {
    id: connection.id,
    userId: connection.userId,
    agentId: connection.agentId,
    toolName: connection.toolName,
    capabilityKey: connection.capabilityKey,
    capability: getWorkflowCapability(connection.capabilityKey) ?? null,
    description: connection.description,
    name: connection.name,
    provider: connection.provider,
    endpointUrl: connection.endpointUrl,
    status: connection.status,
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: connection.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: connection.lastFailureReason,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString()
  };
}

function cleanProvider(provider: string | undefined) {
  const value = (provider ?? "custom").trim().toLowerCase();
  return ["n8n", "make", "zapier", "custom"].includes(value) ? value : "custom";
}

function cleanToolName(toolName: string | undefined) {
  const value = (toolName ?? "workflow.run").trim();
  return value || "workflow.run";
}

function cleanDescription(description: string | undefined) {
  return (description ?? "").trim().slice(0, 280);
}

function requireCapability(capabilityKey: string | undefined) {
  const normalized = normalizeWorkflowCapability(capabilityKey);
  if (!normalized) {
    throw badRequest("Choose a supported workflow ability.", "unknown_workflow_capability");
  }
  return normalized;
}

async function assertUserCanUseAgent(input: { userId: string; agentId?: string | null }) {
  if (!input.agentId) return;
  const connection = await prisma.userConnection.findUnique({
    where: {
      userId_agentId: {
        userId: input.userId,
        agentId: input.agentId
      }
    },
    select: { id: true }
  });
  if (!connection) throw badRequest("Choose one of your installed agents before assigning this workflow.", "agent_not_installed");
}

function safeFailureReason(reason: string) {
  return reason.trim().slice(0, 500) || "The workflow could not be reached.";
}

function getArgString(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

async function markWorkflowResult(input: { id: string; ok: boolean; reason?: string }) {
  const now = new Date();
  await prisma.workflowConnection.update({
    where: { id: input.id },
    data: input.ok
      ? {
          status: "active",
          lastTestedAt: now,
          lastSuccessAt: now,
          lastFailureReason: null
        }
      : {
          status: "failed",
          lastTestedAt: now,
          lastFailureAt: now,
          lastFailureReason: safeFailureReason(input.reason ?? "The workflow test failed.")
        }
  });
}

async function findRunnableWorkflow(input: WorkflowExecutionInput) {
  const explicitId = input.workflowId || getArgString(input.arguments, "workflowConnectionId");
  const capabilityKey = inferWorkflowCapability(input.arguments);
  if (explicitId) {
    return prisma.workflowConnection.findFirst({
      where: {
        id: explicitId,
        userId: input.userId
      }
    });
  }

  const assigned = await prisma.workflowConnection.findFirst({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      toolName: input.toolName,
      capabilityKey,
      status: "active"
    },
    orderBy: { updatedAt: "desc" }
  });
  if (assigned) return assigned;

  return prisma.workflowConnection.findFirst({
    where: {
      userId: input.userId,
      agentId: null,
      toolName: input.toolName,
      capabilityKey,
      status: "active"
    },
    orderBy: { updatedAt: "desc" }
  });
}

async function findFallbackWorkflow(input: WorkflowExecutionInput) {
  const capabilityKey = inferWorkflowCapability(input.arguments);
  if (capabilityKey === "general.research") return null;

  const agentGeneral = await prisma.workflowConnection.findFirst({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      toolName: input.toolName,
      capabilityKey: "general.research",
      status: "active"
    },
    orderBy: { updatedAt: "desc" }
  });
  if (agentGeneral) return agentGeneral;

  return prisma.workflowConnection.findFirst({
    where: {
      userId: input.userId,
      agentId: null,
      toolName: input.toolName,
      capabilityKey: "general.research",
      status: "active"
    },
    orderBy: { updatedAt: "desc" }
  });
}

function missingWorkflowReason(input: WorkflowExecutionInput) {
  const capabilityKey = inferWorkflowCapability(input.arguments);
  const capability = getWorkflowCapability(capabilityKey);
  if (!capability) return "No workflow is connected for this agent yet.";
  return `Connect a workflow for ${capability.label} before this agent can use outside automation for that task.`;
}

function sanitizeText(value: unknown, maxLength = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getWebhookReply(body: unknown) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.reply === "string") return record.reply;
  if (typeof record.message === "string") return record.message;
  if (typeof record.output === "string") return record.output;
  const result = record.result;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.reply === "string") return resultRecord.reply;
    if (typeof resultRecord.message === "string") return resultRecord.message;
    if (typeof resultRecord.content === "string") return resultRecord.content;
  }
  return "";
}

function metadataFromBody(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    externalRequestId: typeof record.requestId === "string" ? record.requestId.slice(0, 120) : undefined,
    externalStatus: typeof record.status === "string" ? record.status.slice(0, 80) : undefined
  };
}

async function buildPayload(input: WorkflowExecutionInput, workflow: NonNullable<WorkflowRecord>) {
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: { name: true }
  });
  return {
    workflowConnectionId: workflow.id,
    workflowName: workflow.name,
    capabilityKey: workflow.capabilityKey,
    capabilityLabel: getWorkflowCapability(workflow.capabilityKey)?.label ?? workflow.capabilityKey,
    provider: workflow.provider,
    toolRunId: input.toolRunId,
    userId: input.userId,
    agentId: input.agentId,
    agentName: agent?.name ?? "Agent",
    agentRunId: input.agentRunId,
    toolName: input.toolName,
    input: input.arguments,
    timestamp: new Date().toISOString(),
    context: {
      approvedOnly: true,
      source: "ai-agent-hub"
    }
  };
}

export async function listWorkflowConnections(userId: string) {
  const connections = await prisma.workflowConnection.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });
  return connections.map(serializeWorkflow);
}

export async function createWorkflowConnection(input: {
  userId: string;
  name: string;
  provider?: string;
  endpointUrl: string;
  agentId?: string | null;
  toolName?: string;
  capabilityKey?: string;
  description?: string;
}) {
  const urlDecision = validateExternalUrl(input.endpointUrl);
  if (!urlDecision.allowed) throw badRequest(urlDecision.reason, "unsafe_workflow_url");
  await assertUserCanUseAgent({ userId: input.userId, agentId: input.agentId });

  const signingSecret = createSigningSecret();
  const connection = await prisma.workflowConnection.create({
    data: {
      userId: input.userId,
      agentId: input.agentId || null,
      toolName: cleanToolName(input.toolName),
      capabilityKey: requireCapability(input.capabilityKey),
      description: cleanDescription(input.description),
      name: input.name.trim(),
      provider: cleanProvider(input.provider),
      endpointUrl: urlDecision.url.toString(),
      encryptedSecret: encryptWorkflowSecret(signingSecret),
      status: "draft"
    }
  });
  return {
    workflow: serializeWorkflow(connection),
    signingSecret
  };
}

export async function updateWorkflowConnection(input: {
  userId: string;
  workflowId: string;
  name?: string;
  provider?: string;
  endpointUrl?: string;
  agentId?: string | null;
  toolName?: string;
  capabilityKey?: string;
  description?: string;
  status?: WorkflowStatus;
}) {
  const existing = await prisma.workflowConnection.findFirst({
    where: { id: input.workflowId, userId: input.userId }
  });
  if (!existing) throw notFound("Workflow not found.", "workflow_not_found");

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.provider !== undefined) data.provider = cleanProvider(input.provider);
  if (input.toolName !== undefined) data.toolName = cleanToolName(input.toolName);
  if (input.capabilityKey !== undefined) data.capabilityKey = requireCapability(input.capabilityKey);
  if (input.description !== undefined) data.description = cleanDescription(input.description);
  if (input.status !== undefined) data.status = input.status;
  if (input.agentId !== undefined) {
    await assertUserCanUseAgent({ userId: input.userId, agentId: input.agentId });
    data.agentId = input.agentId || null;
  }
  if (input.endpointUrl !== undefined) {
    const urlDecision = validateExternalUrl(input.endpointUrl);
    if (!urlDecision.allowed) throw badRequest(urlDecision.reason, "unsafe_workflow_url");
    data.endpointUrl = urlDecision.url.toString();
    data.status = "draft";
    data.lastFailureReason = null;
  }

  const updated = await prisma.workflowConnection.update({
    where: { id: existing.id },
    data
  });
  return serializeWorkflow(updated);
}

export async function deleteWorkflowConnection(input: { userId: string; workflowId: string }) {
  const deleted = await prisma.workflowConnection.deleteMany({
    where: { id: input.workflowId, userId: input.userId }
  });
  return deleted.count > 0;
}

export async function getWorkflowConnectionForUser(input: { userId: string; workflowId: string }) {
  const workflow = await prisma.workflowConnection.findFirst({
    where: { id: input.workflowId, userId: input.userId }
  });
  return workflow ? serializeWorkflow(workflow) : null;
}

export async function executeWorkflowConnection(input: WorkflowExecutionInput) {
  const workflow = await findRunnableWorkflow(input) ?? await findFallbackWorkflow(input);
  if (!workflow) return { status: "blocked" as const, reason: missingWorkflowReason(input) };
  if (workflow.status === "disabled") return { status: "blocked" as const, reason: "This workflow is disabled." };
  if (input.requireActive !== false && workflow.status !== "active") {
    return { status: "blocked" as const, reason: "Test and activate this workflow before an agent can use it." };
  }

  const urlDecision = validateExternalUrl(workflow.endpointUrl);
  if (!urlDecision.allowed) {
    await markWorkflowResult({ id: workflow.id, ok: false, reason: urlDecision.reason });
    return { status: "blocked" as const, reason: urlDecision.reason };
  }

  const timeoutMs = Math.min(Math.max(env.EXTERNAL_RUNTIME_TIMEOUT_MS, 500), 30_000);
  const maxResponseBytes = Math.min(Math.max(env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES, 1024), 250_000);
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const payload = await buildPayload(input, workflow);
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const secret = decryptWorkflowSecret(workflow.encryptedSecret);
  const signature = signWorkflowPayload({ secret, timestamp, body });

  try {
    const response = await fetchImpl(urlDecision.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-agent-hub-workflow-id": workflow.id,
        "x-agent-hub-timestamp": timestamp,
        "x-agent-hub-signature": signature
      },
      body,
      signal: controller.signal
    });
    const rawText = await response.text();
    const truncated = rawText.length > maxResponseBytes;
    const limitedText = rawText.slice(0, maxResponseBytes);
    const parsedBody = decodeJson<unknown>(limitedText, limitedText);
    const reply = sanitizeText(getWebhookReply(parsedBody) || parsedBody);
    if (!response.ok) {
      const reason = `The connected workflow did not respond correctly. It returned HTTP ${response.status}.`;
      await markWorkflowResult({ id: workflow.id, ok: false, reason });
      return { status: "blocked" as const, reason };
    }
    await markWorkflowResult({ id: workflow.id, ok: true });
    const workflowResult = normalizeWorkflowResult({
      body: parsedBody,
      workflowConnectionId: workflow.id,
      workflowName: workflow.name,
      capabilityKey: workflow.capabilityKey,
      provider: workflow.provider,
      endpointHost: urlDecision.url.hostname,
      providerStatus: response.status
    });
    return {
      status: "ok" as const,
      result: {
        provider: "webhook",
        workflowConnectionId: workflow.id,
        workflowName: workflow.name,
        capabilityKey: workflow.capabilityKey,
        capabilityLabel: getWorkflowCapability(workflow.capabilityKey)?.label ?? workflow.capabilityKey,
        endpointHost: urlDecision.url.hostname,
        providerStatus: response.status,
        reply: reply || "The workflow completed.",
        workflowResult,
        responseTruncated: truncated,
        ...metadataFromBody(parsedBody)
      }
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const reason = timedOut ? "The workflow took too long to respond." : "The workflow could not be reached.";
    await markWorkflowResult({ id: workflow.id, ok: false, reason });
    return { status: "blocked" as const, reason };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testWorkflowConnection(input: { userId: string; workflowId: string }) {
  const workflow = await prisma.workflowConnection.findFirst({
    where: { id: input.workflowId, userId: input.userId }
  });
  if (!workflow) throw httpError(404, "Workflow not found.", "workflow_not_found");

  const result = await executeWorkflowConnection({
    workflowId: workflow.id,
    userId: input.userId,
    agentId: workflow.agentId ?? "",
    toolName: workflow.toolName,
    arguments: {
      test: true,
      capabilityKey: workflow.capabilityKey,
      message: "AI Agent Hub is testing this workflow connection."
    },
    requireActive: false
  });
  return result.status === "ok"
    ? { ok: true, workflow: await getWorkflowConnectionForUser({ userId: input.userId, workflowId: workflow.id }), result: result.result }
    : { ok: false, workflow: await getWorkflowConnectionForUser({ userId: input.userId, workflowId: workflow.id }), reason: result.reason };
}

export { listWorkflowCapabilities };
