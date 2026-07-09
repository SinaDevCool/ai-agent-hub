import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { encodeJson } from "../services/jsonService.js";
import { writeActivityLog } from "../services/activityLogService.js";
import { serializeAgent } from "../services/serializerService.js";
import { removeAgentForUser } from "../services/agentLifecycleService.js";

export const agentRoutes = Router();

const createAgentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]),
  apiProtocol: z.enum(["MCP", "OpenAPI"]).default("MCP"),
  trustScore: z.number().int().min(0).max(100).default(70),
  description: z.string().trim().min(10).max(500),
  tools: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  requestedSchemas: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  highRiskActions: z.array(z.string().trim().min(1).max(120)).max(12).default([])
});

agentRoutes.get("/", async (req, res) => {
  const agents = await prisma.agent.findMany({
    where: { connections: { some: { userId: req.userId } } },
    include: {
      permissions: { where: { userId: req.userId }, include: { vaultSchema: true } },
      connections: { where: { userId: req.userId } }
    },
    orderBy: { name: "asc" }
  });
  res.json({ agents: agents.map(serializeAgent) });
});

agentRoutes.get("/:id", async (req, res) => {
  const agent = await prisma.agent.findFirst({
    where: { id: req.params.id, connections: { some: { userId: req.userId } } },
    include: {
      permissions: { where: { userId: req.userId }, include: { vaultSchema: true } },
      connections: { where: { userId: req.userId } }
    }
  });
  if (!agent) return res.status(404).json({ error: { message: "Agent not found" } });
  res.json({ agent: serializeAgent(agent) });
});

agentRoutes.delete("/:id", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const result = await removeAgentForUser({ userId: req.userId, agentId: req.params.id });
  if (!result) return res.status(404).json({ error: { message: "Agent not found" } });
  res.json({ status: "removed", deletedAgent: result.deletedAgent });
});

agentRoutes.post("/", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const userId = req.userId;
  const input = createAgentSchema.parse(req.body);
  const existingUserAgent = await prisma.agent.findFirst({
    where: { name: input.name, connections: { some: { userId } } },
    select: { id: true }
  });
  if (existingUserAgent) {
    return res.status(409).json({ error: { message: "A helper with that name already exists in your profile" } });
  }

  const schemas = await prisma.vaultSchema.findMany({
    where: { name: { in: input.requestedSchemas } },
    select: { name: true }
  });
  const knownSchemaNames = new Set(schemas.map((schema) => schema.name));
  const unknownSchemas = input.requestedSchemas.filter((schemaName) => !knownSchemaNames.has(schemaName));
  if (unknownSchemas.length > 0) {
    return res.status(400).json({ error: { message: `Unknown vault schema: ${unknownSchemas.join(", ")}` } });
  }

  const capabilityManifest = {
    protocol: input.apiProtocol,
    tools: input.tools,
    requestedSchemas: input.requestedSchemas,
    highRiskActions: input.highRiskActions,
    description: input.description
  };

  const agent = await prisma.$transaction(async (tx) => {
    const record = await tx.agent.create({
      data: {
        name: input.name,
        category: input.category,
        apiProtocol: input.apiProtocol,
        trustScore: input.trustScore,
        capabilityManifest: encodeJson(capabilityManifest)
      }
    });
    await tx.userConnection.create({
      data: {
        userId,
        agentId: record.id,
        connectionStatus: "restricted",
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    return tx.agent.findUniqueOrThrow({
      where: { id: record.id },
      include: { permissions: { include: { vaultSchema: true } }, connections: true }
    });
  });

  await writeActivityLog({
    userId,
    agentId: agent.id,
    actionType: "agent_created",
    status: "success",
    dataAccessed: agent.name,
    dynamicMetadata: {
      category: agent.category,
      apiProtocol: agent.apiProtocol,
      requestedSchemas: input.requestedSchemas,
      tools: input.tools,
      highRiskActions: input.highRiskActions
    }
  });

  res.status(201).json({ agent: serializeAgent(agent) });
});
