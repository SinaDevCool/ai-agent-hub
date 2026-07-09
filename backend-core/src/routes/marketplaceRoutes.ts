import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { writeActivityLog } from "../services/activityLogService.js";
import { serializeAgentDefinition, serializeUserAgentInstall } from "../services/serializerService.js";

export const marketplaceRoutes = Router();

const categorySchema = z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]);

const installSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional()
});

function matchesMarketplaceSearch(definition: { name: string; tagline: string; description: string }, search: string) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [definition.name, definition.tagline, definition.description].some((value) => value.toLowerCase().includes(needle));
}

async function resolveInstallAgentName(userId: string, requestedName: string) {
  const existingAgent = await prisma.agent.findFirst({
    where: { name: requestedName, connections: { some: { userId } } },
    select: { id: true }
  });
  if (!existingAgent) return requestedName;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${requestedName} ${index}`;
    const conflict = await prisma.agent.findFirst({
      where: { name: candidate, connections: { some: { userId } } },
      select: { id: true }
    });
    if (!conflict) return candidate;
  }
  return `${requestedName} ${Date.now()}`;
}

marketplaceRoutes.get("/agents", async (req, res) => {
  const categoryInput = typeof req.query.category === "string" ? req.query.category : undefined;
  const category = categoryInput ? categorySchema.parse(categoryInput) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const definitions = await prisma.agentDefinition.findMany({
    where: {
      status: "published",
      ...(category ? { category } : {})
    },
    include: {
      creator: true,
      versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
      installs: { where: { userId: req.userId }, take: 1 }
    },
    orderBy: [{ installCount: "desc" }, { trustScore: "desc" }, { name: "asc" }]
  });
  res.json({ agents: definitions.filter((definition) => matchesMarketplaceSearch(definition, search)).map(serializeAgentDefinition) });
});

marketplaceRoutes.get("/agents/:slug", async (req, res) => {
  const definition = await prisma.agentDefinition.findFirst({
    where: { slug: req.params.slug, status: "published" },
    include: {
      creator: true,
      versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
      installs: { where: { userId: req.userId }, take: 1 }
    }
  });
  if (!definition) return res.status(404).json({ error: { message: "Marketplace agent not found" } });
  res.json({ agent: serializeAgentDefinition(definition) });
});

marketplaceRoutes.post("/agents/:id/install", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const userId = req.userId;
  const input = installSchema.parse(req.body);
  const definition = await prisma.agentDefinition.findFirst({
    where: { id: req.params.id, status: "published" },
    include: { versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } } }
  });
  if (!definition || !definition.versions[0]) {
    return res.status(404).json({ error: { message: "Marketplace agent is not available for install" } });
  }

  const version = definition.versions[0];
  const displayName = input.displayName || definition.name;
  const existingInstall = await prisma.userAgentInstall.findUnique({
    where: { userId_agentDefinitionId: { userId, agentDefinitionId: definition.id } },
    include: {
      agentDefinition: { include: { creator: true, versions: { where: { isActive: true }, take: 1 } } },
      agentVersion: true,
      agent: { include: { permissions: { where: { userId }, include: { vaultSchema: true } }, connections: { where: { userId } } } }
    }
  });
  if (existingInstall) return res.json({ install: serializeUserAgentInstall(existingInstall) });

  const resolvedDisplayName = await resolveInstallAgentName(userId, displayName);
  const install = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        name: resolvedDisplayName,
        category: definition.category,
        apiProtocol: version.apiProtocol,
        trustScore: definition.trustScore,
        capabilityManifest: version.capabilityManifest
      }
    });

    await tx.userConnection.upsert({
      where: { userId_agentId: { userId, agentId: agent.id } },
      update: { connectionStatus: "restricted" },
      create: {
        userId,
        agentId: agent.id,
        connectionStatus: "restricted",
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const created = await tx.userAgentInstall.create({
      data: {
        userId,
        agentDefinitionId: definition.id,
        agentVersionId: version.id,
        agentId: agent.id,
        displayName: resolvedDisplayName,
        connectionStatus: "restricted"
      },
      include: {
        agentDefinition: { include: { creator: true, versions: { where: { isActive: true }, take: 1 } } },
        agentVersion: true,
        agent: { include: { permissions: { where: { userId }, include: { vaultSchema: true } }, connections: { where: { userId } } } }
      }
    });
    await tx.agentDefinition.update({ where: { id: definition.id }, data: { installCount: { increment: 1 } } });
    return created;
  });

  await writeActivityLog({
    userId,
    agentId: install.agentId,
    actionType: "agent_created",
    status: "success",
    dataAccessed: install.displayName,
    dynamicMetadata: {
      source: "marketplace_install",
      marketplaceAgentId: definition.id,
      marketplaceAgentSlug: definition.slug
    }
  });

  res.status(201).json({ install: serializeUserAgentInstall(install) });
});
