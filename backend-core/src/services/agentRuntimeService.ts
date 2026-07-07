import { prisma } from "../db/prisma.js";
import { createHitlRequest } from "./hitlService.js";
import { writeActivityLog } from "./activityLogService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { evaluateVaultPermission, isHighRiskAction, logDecision } from "./permissionEngine.js";
import { generateRuntimeReply } from "./openAiRuntimeService.js";
import { serializeAgentConversation, serializeVaultDocument } from "./serializerService.js";
import { searchVaultDocuments } from "./vaultIndexService.js";

type RuntimeIntent = "search" | "action" | "blocked";

type RuntimeAgent = {
  id: string;
  name: string;
  capabilityManifest: string;
};

type RuntimeResult = {
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: RuntimeIntent;
  reply: string;
  reason?: string;
  runtimeState?: "ready" | "needs_permission" | "needs_approval" | "blocked" | "failed";
  nextStep?: string;
  missingPermissions?: string[];
  actionName?: string;
  requestId?: string;
  usedSchemas?: string[];
  documents?: unknown[];
  provider?: "openai" | "local";
  model?: string;
};

function getRuntimeIntent(message: string): RuntimeIntent {
  if (!message.trim()) return "blocked";
  if (/\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open)\b/i.test(message)) return "action";
  return "search";
}

function getRequestedAction(message: string, highRiskActions: string[]) {
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

function friendlyActionName(action: string) {
  return action.replace(/_/g, " ");
}

async function getAllowedSchemaIds(userId: string, agentId: string, requestedSchemas: string[]) {
  const schemas = await prisma.vaultSchema.findMany({
    where: requestedSchemas.length ? { name: { in: requestedSchemas } } : undefined,
    select: { id: true, name: true }
  });
  const allowed = [];
  for (const schema of schemas) {
    const decision = await evaluateVaultPermission({
      userId,
      agentId,
      permissionType: "read",
      vaultSchemaId: schema.id
    });
    if (decision.allowed) allowed.push(schema);
  }
  return allowed;
}

function buildSearchReply(agent: RuntimeAgent, count: number, schemaNames: string[]) {
  if (count === 0) {
    return `${agent.name} checked the info it is allowed to read, but did not find a strong match.`;
  }
  const scope = schemaNames.length ? ` from ${schemaNames.join(", ")}` : "";
  return `${agent.name} Found ${count} matching personal info item${count === 1 ? "" : "s"}${scope}.`;
}

export async function getOrCreateAgentConversation(input: { userId: string; agentId: string }) {
  const agent = await prisma.agent.findFirst({
    where: {
      id: input.agentId,
      connections: { some: { userId: input.userId } }
    }
  });
  if (!agent) return null;

  const existing = await prisma.agentConversation.findFirst({
    where: { userId: input.userId, agentId: input.agentId },
    include: { messages: { orderBy: { createdAt: "asc" } }, agent: true },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) return serializeAgentConversation(existing);

  const conversation = await prisma.agentConversation.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      title: agent.name
    },
    include: { messages: { orderBy: { createdAt: "asc" } }, agent: true }
  });
  return serializeAgentConversation(conversation);
}

async function ensureConversation(userId: string, agent: RuntimeAgent) {
  const existing = await prisma.agentConversation.findFirst({
    where: { userId, agentId: agent.id },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) return existing;
  return prisma.agentConversation.create({
    data: {
      userId,
      agentId: agent.id,
      title: agent.name
    }
  });
}

async function appendRuntimeMessages(input: {
  userId: string;
  agent: RuntimeAgent;
  userMessage: string;
  result: RuntimeResult;
}) {
  const conversation = await ensureConversation(input.userId, input.agent);
  await prisma.$transaction([
    prisma.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: input.userMessage,
        metadata: "{}"
      }
    }),
    prisma.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: "agent",
        content: input.result.reply,
        status: input.result.status === "blocked" ? "blocked_by_policy" : input.result.status === "awaiting_human_approval" ? "pending_human_approval" : "success",
        intent: input.result.intent,
        metadata: encodeJson({
          reason: input.result.reason,
          runtimeState: input.result.runtimeState,
          nextStep: input.result.nextStep,
          missingPermissions: input.result.missingPermissions,
          actionName: input.result.actionName,
          requestId: input.result.requestId,
          usedSchemas: input.result.usedSchemas,
          documents: input.result.documents,
          provider: input.result.provider,
          model: input.result.model
        })
      }
    }),
    prisma.agentConversation.update({
      where: { id: conversation.id },
      data: { title: input.userMessage.slice(0, 80) || input.agent.name }
    })
  ]);
  const savedConversation = await prisma.agentConversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, agent: true }
  });
  return serializeAgentConversation(savedConversation);
}

async function withPersistedConversation(input: {
  userId: string;
  agent: RuntimeAgent;
  message: string;
  result: RuntimeResult;
}) {
  const conversation = await appendRuntimeMessages({
    userId: input.userId,
    agent: input.agent,
    userMessage: input.message,
    result: input.result
  });
  return { ...input.result, conversation };
}

export async function runAgentForUser(input: { userId: string; agentId: string; message: string }) {
  const message = input.message.trim();
  const agent = await prisma.agent.findFirst({
    where: {
      id: input.agentId,
      connections: { some: { userId: input.userId } }
    }
  });
  if (!agent) {
    return {
      status: "blocked" as const,
      intent: "blocked" as const,
      reply: "This agent is not connected to your profile.",
      reason: "Agent is not connected to this user.",
      runtimeState: "blocked" as const,
      nextStep: "Add this agent to your profile before using it."
    };
  }

  const manifest = decodeJson<{ tools?: string[]; requestedSchemas?: string[]; highRiskActions?: string[]; description?: string }>(agent.capabilityManifest, {});
  const tools = new Set(manifest.tools ?? []);
  const intent = getRuntimeIntent(message);

  if (/^continue the approved action:/i.test(message) || /^continue approved action:/i.test(message)) {
    const approvedRequest = await prisma.hitlRequest.findFirst({
      where: {
        userId: input.userId,
        agentId: agent.id,
        status: "success"
      },
      orderBy: { decidedAt: "desc" }
    });
    if (!approvedRequest) {
      return withPersistedConversation({
        userId: input.userId,
        agent,
        message,
        result: {
          status: "blocked" as const,
          intent: "action" as const,
          reply: `${agent.name} could not find an approved action to continue.`,
          reason: "No approved human-in-the-loop request was found for this agent.",
          runtimeState: "blocked" as const,
          nextStep: "Approve the paused action first, then continue it."
        }
      });
    }
    await writeActivityLog({
      userId: input.userId,
      agentId: agent.id,
      actionType: "execution_triggered",
      status: "success",
      dataAccessed: approvedRequest.actionName,
      dynamicMetadata: {
        requestId: approvedRequest.id,
        source: "approved_hitl_continuation"
      }
    });
    return withPersistedConversation({
      userId: input.userId,
      agent,
      message,
      result: {
        status: "ok" as const,
        intent: "action" as const,
        reply: `${agent.name} completed the approved action: ${friendlyActionName(approvedRequest.actionName)}.`,
        actionName: approvedRequest.actionName,
        requestId: approvedRequest.id,
        runtimeState: "ready" as const,
        nextStep: "The action is recorded in Activity."
      }
    });
  }

  if (intent === "search") {
    if (!tools.has("vault.search")) {
      return withPersistedConversation({
        userId: input.userId,
        agent,
        message,
        result: {
        status: "blocked" as const,
        intent,
        reply: `${agent.name} cannot search personal info because that tool is not enabled.`,
        reason: "vault.search is not enabled for this agent.",
        runtimeState: "blocked" as const,
        nextStep: "Choose an agent that can read personal info, or add vault.search to this agent."
        }
      });
    }

    const allowedSchemas = await getAllowedSchemaIds(input.userId, agent.id, manifest.requestedSchemas ?? []);
    if (!allowedSchemas.length) {
      const decision = await evaluateVaultPermission({
        userId: input.userId,
        agentId: agent.id,
        permissionType: "read"
      });
      await logDecision({
        userId: input.userId,
        agentId: agent.id,
        actionType: "vault_read",
        decision,
        dataAccessed: "agent-runtime-search",
        metadata: { message }
      });
      return withPersistedConversation({
        userId: input.userId,
        agent,
        message,
        result: {
        status: "blocked" as const,
        intent,
        reply: `${agent.name} needs permission before it can use your personal info.`,
        reason: decision.reason,
        runtimeState: "needs_permission" as const,
        nextStep: "Review and allow the requested private info for this agent.",
        missingPermissions: manifest.requestedSchemas ?? []
        }
      });
    }

    const documents = (await Promise.all(
      allowedSchemas.map((schema) => searchVaultDocuments(input.userId, message, schema.id))
    ))
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    await logDecision({
      userId: input.userId,
      agentId: agent.id,
      actionType: "vault_read",
      decision: { allowed: true, reason: "Agent runtime used only granted personal info categories." },
      dataAccessed: "agent-runtime-search",
      metadata: { message, schemaIds: allowedSchemas.map((schema) => schema.id) }
    });

    const serializedDocuments = documents.map(serializeVaultDocument);
    const schemaNames = allowedSchemas.map((schema) => schema.name);
    const fallbackReply = buildSearchReply(agent, documents.length, schemaNames);
    const generated = await generateRuntimeReply({
      agentName: agent.name,
      agentDescription: manifest.description,
      userMessage: message,
      status: "ok",
      intent,
      fallbackReply,
      documents: serializedDocuments,
      usedSchemas: schemaNames
    });

    return withPersistedConversation({
      userId: input.userId,
      agent,
      message,
      result: {
      status: "ok" as const,
      intent,
      reply: generated.reply,
      documents: serializedDocuments,
      usedSchemas: schemaNames,
      provider: generated.provider,
      model: generated.model,
      runtimeState: "ready" as const,
      nextStep: documents.length ? "Review the answer and ask a follow-up if needed." : "Try a more specific question or add more private info."
      }
    });
  }

  if (intent === "action") {
    if (!tools.has("action.execute")) {
      return withPersistedConversation({
        userId: input.userId,
        agent,
        message,
        result: {
        status: "blocked" as const,
        intent,
        reply: `${agent.name} cannot take actions. It can only help with information lookup.`,
        reason: "action.execute is not enabled for this agent.",
        runtimeState: "blocked" as const,
        nextStep: "Use this agent for questions only, or add an action-capable agent."
        }
      });
    }

    const actionName = getRequestedAction(message, manifest.highRiskActions ?? []);
    if (isHighRiskAction(actionName) || (manifest.highRiskActions ?? []).includes(actionName)) {
      const request = await createHitlRequest({
        userId: input.userId,
        agentId: agent.id,
        actionName,
        payload: { message, source: "agent_runtime" }
      });
      return withPersistedConversation({
        userId: input.userId,
        agent,
        message,
        result: {
        status: "awaiting_human_approval" as const,
        intent,
        reply: `${agent.name} paused this action and sent it to you for approval.`,
        runtimeState: "needs_approval" as const,
        nextStep: "Approve or deny this action before the agent continues.",
        actionName,
        requestId: request.id
        }
      });
    }

    const decision = await evaluateVaultPermission({
      userId: input.userId,
      agentId: agent.id,
      permissionType: "execute_action"
    });
    await logDecision({
      userId: input.userId,
      agentId: agent.id,
      actionType: "execution_triggered",
      decision,
      dataAccessed: actionName,
      metadata: { message, source: "agent_runtime" }
    });
    const result = decision.allowed
      ? {
        status: "ok" as const,
        intent,
        reply: `${agent.name} completed the allowed action: ${actionName.replace(/_/g, " ")}.`,
        actionName,
        runtimeState: "ready" as const,
        nextStep: "Check the activity log for the recorded action."
      }
      : {
        status: "blocked" as const,
        intent,
        reply: `${agent.name} is not allowed to do that yet.`,
        reason: decision.reason,
        actionName,
        runtimeState: "blocked" as const,
        nextStep: "Review this agent's action permissions before trying again."
      };
    return withPersistedConversation({ userId: input.userId, agent, message, result });
  }

  return withPersistedConversation({
    userId: input.userId,
    agent,
    message,
    result: {
    status: "blocked" as const,
    intent,
    reply: "Please ask a clear question or action.",
    reason: "Empty message.",
    runtimeState: "blocked" as const,
    nextStep: "Type a question or an action request for this agent."
    }
  });
}
