import type { AgentCategory } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { resolvedVaultPath } from "../config/env.js";
import { createVaultSalt } from "./cryptoService.js";
import { encodeJson } from "./jsonService.js";
import { reindexVault } from "./vaultIndexService.js";

const defaultAgents: Array<{
  name: string;
  category: AgentCategory;
  trustScore: number;
  capabilityManifest: Record<string, unknown>;
  connectionStatus: "active" | "restricted";
}> = [
  {
    name: "The Concierge",
    category: "Travel",
    trustScore: 86,
    connectionStatus: "active",
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Personal Identity Profile", "Frequent Flyer Ledger"],
      highRiskActions: ["book_non_refundable_travel"],
      description: "Travel booking, itinerary assembly, and document-aware reservation support."
    }
  },
  {
    name: "The Banker",
    category: "Financial",
    trustScore: 81,
    connectionStatus: "active",
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Financial Preferences"],
      highRiskActions: ["open_credit_card", "transfer_funds"],
      description: "Credit card optimization, expense tracking, and spending-policy enforcement."
    }
  },
  {
    name: "The Chief of Staff",
    category: "Executive",
    trustScore: 89,
    connectionStatus: "active",
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Personal Identity Profile"],
      highRiskActions: [],
      description: "Task coordination, calendar context, reminders, and household operations."
    }
  },
  {
    name: "The Curator",
    category: "Domestic",
    trustScore: 74,
    connectionStatus: "restricted",
    capabilityManifest: {
      protocol: "OpenAPI",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Financial Preferences"],
      highRiskActions: [],
      description: "Shopping, groceries, subscription audits, and preference-aware recommendations."
    }
  },
  {
    name: "The Archivist",
    category: "Maintenance",
    trustScore: 94,
    connectionStatus: "active",
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search"],
      requestedSchemas: ["Personal Identity Profile", "Financial Preferences", "Frequent Flyer Ledger", "Medical History"],
      highRiskActions: [],
      description: "Vault indexing, schema hygiene, duplicate detection, and context maintenance."
    }
  }
];

export async function ensureUserWorkspace(input: { id: string; email: string }) {
  const existingUser = await prisma.user.findUnique({ where: { id: input.id }, select: { id: true } });
  const user = await prisma.user.upsert({
    where: { id: input.id },
    update: { email: input.email, vaultLocalPath: resolvedVaultPath },
    create: {
      id: input.id,
      email: input.email,
      vaultLocalPath: resolvedVaultPath,
      vaultEncryptionSalt: createVaultSalt()
    }
  });

  await ensureDefaultAgentConnections(user.id);

  if (!existingUser) {
    await reindexVault(user.id);
  }

  return user;
}

async function ensureDefaultAgentConnections(userId: string) {
  for (const agentData of defaultAgents) {
    const existingAgent = await prisma.agent.findFirst({
      where: { name: agentData.name, connections: { some: { userId } } }
    });
    const agent = existingAgent
      ? await prisma.agent.update({
        where: { id: existingAgent.id },
        data: {
        category: agentData.category,
        trustScore: agentData.trustScore,
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP"
        }
      })
      : await prisma.agent.create({
        data: {
        name: agentData.name,
        category: agentData.category,
        trustScore: agentData.trustScore,
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP"
        }
      }
      );

    await prisma.userConnection.upsert({
      where: { userId_agentId: { userId, agentId: agent.id } },
      update: {},
      create: {
        userId,
        agentId: agent.id,
        connectionStatus: agentData.connectionStatus,
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  }
}
