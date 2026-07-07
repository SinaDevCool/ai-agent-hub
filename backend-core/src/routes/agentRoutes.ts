import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { encodeJson } from "../services/jsonService.js";
import { writeActivityLog } from "../services/activityLogService.js";
import { serializeAgent } from "../services/serializerService.js";

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
  const userId = req.userId;
  const agent = await prisma.agent.findFirst({
    where: { id: req.params.id, connections: { some: { userId } } },
    select: { id: true, name: true }
  });
  if (!agent) return res.status(404).json({ error: { message: "Agent not found" } });

  await prisma.$transaction(async (tx) => {
    await tx.agentPermission.deleteMany({ where: { userId, agentId: agent.id } });
    await tx.userAgentInstall.deleteMany({ where: { userId, agentId: agent.id } });
    await tx.userConnection.deleteMany({ where: { userId, agentId: agent.id } });
    await tx.hitlRequest.deleteMany({ where: { userId, agentId: agent.id, status: "pending_human_approval" } });
  });

  await writeActivityLog({
    userId,
    agentId: agent.id,
    actionType: "agent_removed",
    status: "success",
    dataAccessed: agent.name,
    dynamicMetadata: { userManaged: true }
  });

  res.json({ status: "removed" });
});

agentRoutes.post("/", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const userId = req.userId;
  const input = createAgentSchema.parse(req.body);
  const existing = await prisma.agent.findUnique({ where: { name: input.name }, select: { id: true } });
  if (existing) {
    const existingConnection = await prisma.userConnection.findUnique({
      where: { userId_agentId: { userId, agentId: existing.id } },
      select: { id: true }
    });
    if (existingConnection) return res.status(409).json({ error: { message: "An agent with that name already exists" } });
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
    const record = existing
      ? await tx.agent.findUniqueOrThrow({ where: { id: existing.id } })
      : await tx.agent.create({
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
