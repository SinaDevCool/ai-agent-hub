import type { AgentCapabilityManifest, RuntimeAgent, RuntimeBranchResult, RuntimeResult } from "./agentRuntimeTypes.js";
import { generateRuntimeReply } from "./openAiRuntimeService.js";
import { executeTool } from "./toolExecutionService.js";

function buildSearchReply(agent: RuntimeAgent, count: number, schemaNames: string[]) {
  if (count === 0) {
    return `${agent.name} checked the info it is allowed to read, but did not find a strong match.`;
  }
  const scope = schemaNames.length ? ` from ${schemaNames.join(", ")}` : "";
  return `${agent.name} Found ${count} matching personal info item${count === 1 ? "" : "s"}${scope}.`;
}

export async function runVaultSearchIntent(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  message: string;
  manifest: AgentCapabilityManifest;
  tools: Set<string>;
}): Promise<RuntimeBranchResult> {
  if (!input.tools.has("vault.search")) {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "search",
      reply: `${input.agent.name} cannot search personal info because that tool is not enabled.`,
      reason: "vault.search is not enabled for this agent.",
      runtimeState: "blocked",
      nextStep: "Choose an agent that can read personal info, or add vault.search to this agent."
    };
    return {
      result,
      step: {
        title: "Check search capability",
        input: { toolName: "vault.search" },
        error: "vault.search is not enabled for this agent."
      }
    };
  }

  const searchResult = await executeTool({
    userId: input.userId,
    agentId: input.agent.id,
    agentRunId: input.agentRunId,
    toolName: "vault.search",
    arguments: { query: input.message }
  });
  if (searchResult.status === "blocked") {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "search",
      reply: `${input.agent.name} needs permission before it can use your personal info.`,
      reason: searchResult.reason,
      runtimeState: "needs_permission",
      nextStep: "Review and allow the requested private info for this agent.",
      missingPermissions: input.manifest.requestedSchemas ?? []
    };
    return {
      result,
      step: {
        title: "Search personal info",
        toolRunId: searchResult.toolRunId,
        input: { query: input.message },
        error: searchResult.reason
      }
    };
  }

  if (searchResult.status !== "ok") {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "search",
      reply: `${input.agent.name} could not search your personal info right now.`,
      reason: "The search tool did not complete.",
      runtimeState: "failed",
      nextStep: "Try again, or review this agent's private info access."
    };
    return {
      result,
      step: {
        title: "Search personal info",
        toolRunId: searchResult.toolRunId,
        input: { query: input.message },
        error: "The search tool did not complete."
      }
    };
  }

  const serializedDocuments: unknown[] = searchResult.documents ?? [];
  const runtimeDocuments = serializedDocuments as NonNullable<Parameters<typeof generateRuntimeReply>[0]["documents"]>;
  const schemaNames: string[] = Array.from(new Set(serializedDocuments
    .map((document: unknown) => typeof document === "object" && document && "vaultSchema" in document
      ? (document as { vaultSchema?: { name?: string } | null }).vaultSchema?.name
      : undefined)
    .filter((schemaName: string | undefined): schemaName is string => Boolean(schemaName))));
  const fallbackReply = buildSearchReply(input.agent, serializedDocuments.length, schemaNames);
  const generated = await generateRuntimeReply({
    agentName: input.agent.name,
    agentDescription: input.manifest.description,
    userMessage: input.message,
    status: "ok",
    intent: "search",
    fallbackReply,
    documents: runtimeDocuments,
    usedSchemas: schemaNames
  });

  const result: RuntimeResult = {
    status: "ok",
    intent: "search",
    reply: generated.reply,
    documents: serializedDocuments,
    usedSchemas: schemaNames,
    provider: generated.provider,
    providerFallbackReason: generated.fallbackReason,
    model: generated.model,
    runtimeState: "ready",
    nextStep: serializedDocuments.length ? "Review the answer and ask a follow-up if needed." : "Try a more specific question or add more private info."
  };
  return {
    result,
    step: {
      title: "Search personal info",
      toolRunId: searchResult.toolRunId,
      input: { query: input.message },
      output: { documents: serializedDocuments.length, usedSchemas: schemaNames }
    }
  };
}
