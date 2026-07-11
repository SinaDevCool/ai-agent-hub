import { prisma } from "../db/prisma.js";
import { evaluateVaultPermission } from "./permissionEngine.js";

export async function getAllowedVaultSchemas(input: {
  userId: string;
  agentId: string;
  requestedSchemas: string[];
}) {
  const schemas = await prisma.vaultSchema.findMany({
    where: input.requestedSchemas.length ? { name: { in: input.requestedSchemas } } : undefined,
    select: { id: true, name: true }
  });
  const allowed = [];
  for (const schema of schemas) {
    const decision = await evaluateVaultPermission({
      userId: input.userId,
      agentId: input.agentId,
      permissionType: "read",
      vaultSchemaId: schema.id
    });
    if (decision.allowed) allowed.push(schema);
  }
  return allowed;
}
