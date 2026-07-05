import { prisma } from "../db/prisma.js";
import { evaluateVaultPermission, isHighRiskAction, logDecision } from "./permissionEngine.js";
import { searchVaultDocuments } from "./vaultIndexService.js";
import { createHitlRequest } from "./hitlService.js";
import { serializeVaultDocument } from "./serializerService.js";

export async function handleToolCall(input: {
  userId: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  if (input.toolName === "vault.search") {
    const schemaName = typeof input.arguments.schema === "string" ? input.arguments.schema : undefined;
    const query = typeof input.arguments.query === "string" ? input.arguments.query : "";
    const schema = schemaName ? await prisma.vaultSchema.findUnique({ where: { name: schemaName } }) : null;
    const decision = await evaluateVaultPermission({
      userId: input.userId,
      agentId: input.agentId,
      permissionType: "read",
      vaultSchemaId: schema?.id ?? null
    });
    await logDecision({
      userId: input.userId,
      agentId: input.agentId,
      actionType: "vault_read",
      decision,
      dataAccessed: schemaName ?? "semantic-search",
      metadata: { toolName: input.toolName, query }
    });
    if (!decision.allowed) return { status: "blocked", reason: decision.reason };
    const documents = await searchVaultDocuments(input.userId, query, schema?.id);
    return { status: "ok", documents: documents.map(serializeVaultDocument) };
  }

  if (input.toolName === "action.execute") {
    const actionName = String(input.arguments.actionName ?? "");
    if (isHighRiskAction(actionName)) {
      const request = await createHitlRequest({
        userId: input.userId,
        agentId: input.agentId,
        actionName,
        payload: input.arguments
      });
      return { status: "awaiting_human_approval", requestId: request.id };
    }
    const decision = await evaluateVaultPermission({
      userId: input.userId,
      agentId: input.agentId,
      permissionType: "execute_action"
    });
    await logDecision({
      userId: input.userId,
      agentId: input.agentId,
      actionType: "execution_triggered",
      decision,
      dataAccessed: actionName,
      metadata: { toolName: input.toolName }
    });
    return decision.allowed ? { status: "ok", actionName } : { status: "blocked", reason: decision.reason };
  }

  return { status: "blocked", reason: `Unknown tool '${input.toolName}'.` };
}
