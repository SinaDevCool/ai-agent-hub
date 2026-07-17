import { prisma } from "../db/prisma.js";
import { encodeJson } from "./jsonService.js";
import { buildRuntimeChatDisplay, buildRuntimeUserChatDisplay } from "./runtimeChatDisplayService.js";
import { serializeAgentConversation } from "./serializerService.js";
import type { RuntimeAgent, RuntimeResult } from "./agentRuntimeTypes.js";

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
  const userDisplay = buildRuntimeUserChatDisplay(input.userMessage);
  const agentDisplay = buildRuntimeChatDisplay({ agent: input.agent, result: input.result });
  await prisma.$transaction([
    prisma.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: input.userMessage,
        metadata: encodeJson(userDisplay ? { display: userDisplay } : {})
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
          model: input.result.model,
          providerFallbackReason: input.result.providerFallbackReason,
          externalRuntime: input.result.externalRuntime,
          workflowResult: input.result.workflowResult,
          providerReceipt: input.result.providerReceipt,
          display: agentDisplay
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
  return {
    conversation: serializeAgentConversation(savedConversation),
    display: agentDisplay
  };
}

export async function withPersistedConversation(input: {
  userId: string;
  agent: RuntimeAgent;
  message: string;
  result: RuntimeResult;
}) {
  const { conversation, display } = await appendRuntimeMessages({
    userId: input.userId,
    agent: input.agent,
    userMessage: input.message,
    result: input.result
  });
  return { ...input.result, display, conversation };
}
