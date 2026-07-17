import { prisma } from "../../../db/prisma.js";
import { createHitlRequest } from "../../hitlService.js";
import { evaluateVaultPermission, isHighRiskAction, logDecision } from "../../permissionEngine.js";
import { serializeVaultDocument } from "../../serializerService.js";
import { searchVaultDocuments } from "../../vaultIndexService.js";
import type { AdapterExecutionInput, AdapterExecutionResult, ToolAdapter } from "../toolExecutionTypes.js";

async function executeVaultSearch(input: AdapterExecutionInput): Promise<AdapterExecutionResult> {
  const schemaName = typeof input.arguments.schema === "string" ? input.arguments.schema : undefined;
  const query = typeof input.arguments.query === "string" ? input.arguments.query : "";
  const schema = schemaName ? await prisma.vaultSchema.findUnique({ where: { name: schemaName } }) : null;

  if (!schemaName) {
    const permissions = await prisma.agentPermission.findMany({
      where: {
        userId: input.userId,
        agentId: input.agentId,
        permissionType: "read",
        vaultSchemaId: { not: null }
      },
      select: { vaultSchemaId: true, expiresAt: true }
    });
    const now = new Date();
    const grantedSchemaIds = Array.from(new Set(
      permissions
        .filter((permission) => permission.vaultSchemaId && (!permission.expiresAt || permission.expiresAt > now))
        .map((permission) => String(permission.vaultSchemaId))
    ));
    const allowedSchemaIds = (await Promise.all(grantedSchemaIds.map(async (schemaId) => ({
      schemaId,
      decision: await evaluateVaultPermission({
        userId: input.userId,
        agentId: input.agentId,
        permissionType: "read",
        vaultSchemaId: schemaId
      })
    })))).filter((item) => item.decision.allowed).map((item) => item.schemaId);

    if (!allowedSchemaIds.length) {
      const decision = await evaluateVaultPermission({
        userId: input.userId,
        agentId: input.agentId,
        permissionType: "read"
      });
      await logDecision({
        userId: input.userId,
        agentId: input.agentId,
        actionType: "vault_read",
        decision,
        dataAccessed: "semantic-search",
        metadata: { toolName: input.toolName, query, toolRunId: input.toolRunId }
      });
      return { status: "blocked", reason: decision.reason };
    }

    const documents = (await Promise.all(allowedSchemaIds.map((schemaId) => searchVaultDocuments(input.userId, query, schemaId))))
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    await logDecision({
      userId: input.userId,
      agentId: input.agentId,
      actionType: "vault_read",
      decision: { allowed: true, reason: "Permission, connection, expiry, and restriction rules passed." },
      dataAccessed: "semantic-search",
      metadata: { toolName: input.toolName, query, schemas: allowedSchemaIds.length, toolRunId: input.toolRunId }
    });
    return { status: "ok", documents: documents.map(serializeVaultDocument) };
  }

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
    metadata: { toolName: input.toolName, query, toolRunId: input.toolRunId }
  });
  if (!decision.allowed) return { status: "blocked", reason: decision.reason };

  const documents = await searchVaultDocuments(input.userId, query, schema?.id);
  return { status: "ok", documents: documents.map(serializeVaultDocument) };
}

async function executeAction(input: AdapterExecutionInput): Promise<AdapterExecutionResult> {
  const actionName = String(input.arguments.actionName ?? "");
  if (isHighRiskAction(actionName) && !input.approvalOverride) {
    const request = await createHitlRequest({
      userId: input.userId,
      agentId: input.agentId,
      actionName,
      payload: { ...input.arguments, toolRunId: input.toolRunId }
    });
    return { status: "awaiting_human_approval", requestId: request.id };
  }

  if (isHighRiskAction(actionName) && input.approvalOverride) {
    await logDecision({
      userId: input.userId,
      agentId: input.agentId,
      actionType: "execution_triggered",
      decision: { allowed: true, reason: "User approved this specific high-risk action." },
      dataAccessed: actionName,
      metadata: { toolName: input.toolName, toolRunId: input.toolRunId, requestId: input.approvalOverride.hitlRequestId }
    });
    return { status: "ok", actionName, result: { actionName, approvedByRequestId: input.approvalOverride.hitlRequestId } };
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
      metadata: { toolName: input.toolName, toolRunId: input.toolRunId }
    });
  if (!decision.allowed) return { status: "blocked", reason: decision.reason };
  return { status: "ok", actionName, result: { actionName, approvedByRequestId: input.approvalOverride?.hitlRequestId } };
}

export const nativeAdapter: ToolAdapter = {
  type: "native",
  canHandle(definition) {
    return definition.adapterType === "native";
  },
  async execute(input) {
    if (input.toolName === "vault.search") return executeVaultSearch(input);
    if (input.toolName === "action.execute") return executeAction(input);
    return { status: "blocked", reason: `${input.toolName} is registered as a native tool, but execution is not implemented yet.` };
  }
};
