import { PrismaClient, type AgentCategory } from "@prisma/client";
import path from "node:path";
import { createVaultSalt } from "../src/services/cryptoService.js";
import { encodeJson } from "../src/services/jsonService.js";

const prisma = new PrismaClient();

const vaultPath = path.resolve(process.cwd(), "vault-samples/personal-vault");

const schemas = [
  {
    name: "Personal Identity Profile",
    description: "Legal identity, passport, address, and trusted contact fields.",
    structuralTemplate: {
      fields: ["legalName", "preferredName", "passportNumber", "passportExpiry", "homeAirport", "trustedContact"]
    }
  },
  {
    name: "Financial Preferences",
    description: "Budget boundaries, card preferences, rewards goals, and blocked merchant rules.",
    structuralTemplate: {
      fields: ["monthlyDiscretionaryLimit", "preferredCards", "blockedCategories", "approvalThresholdUsd"]
    }
  },
  {
    name: "Frequent Flyer Ledger",
    description: "Loyalty programs, travel documents, seat preferences, and trip history.",
    structuralTemplate: {
      fields: ["programs", "knownTravelerNumber", "seatPreference", "recentTrips"]
    }
  },
  {
    name: "Medical History",
    description: "Sensitive health context requiring explicit, narrow authorization.",
    structuralTemplate: {
      fields: ["conditions", "allergies", "medications", "providers"]
    }
  }
];

const agents: Array<{
  name: string;
  category: AgentCategory;
  trustScore: number;
  capabilityManifest: Record<string, unknown>;
}> = [
  {
    name: "The Concierge",
    category: "Travel",
    trustScore: 86,
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
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search"],
      requestedSchemas: ["Personal Identity Profile", "Financial Preferences", "Frequent Flyer Ledger", "Medical History"],
      highRiskActions: [],
      description: "Vault indexing, schema hygiene, duplicate detection, and context maintenance."
    }
  }
];

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "sample.user@local.ai" },
    update: { vaultLocalPath: vaultPath },
    create: {
      email: "sample.user@local.ai",
      vaultLocalPath: vaultPath,
      vaultEncryptionSalt: createVaultSalt()
    }
  });

  const schemaRecords = new Map<string, string>();
  for (const schema of schemas) {
    const record = await prisma.vaultSchema.upsert({
      where: { name: schema.name },
      update: { ...schema, structuralTemplate: encodeJson(schema.structuralTemplate) },
      create: { ...schema, structuralTemplate: encodeJson(schema.structuralTemplate) }
    });
    schemaRecords.set(record.name, record.id);
  }

  for (const agentData of agents) {
    const agent = await prisma.agent.upsert({
      where: { name: agentData.name },
      update: {
        ...agentData,
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP"
      },
      create: {
        ...agentData,
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP"
      }
    });
    await prisma.userConnection.upsert({
      where: { userId_agentId: { userId: user.id, agentId: agent.id } },
      update: { connectionStatus: agent.name === "The Curator" ? "restricted" : "active" },
      create: {
        userId: user.id,
        agentId: agent.id,
        connectionStatus: agent.name === "The Curator" ? "restricted" : "active",
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    const requestedSchemas = agentData.capabilityManifest.requestedSchemas as string[];
    for (const schemaName of requestedSchemas) {
      await ensurePermission({
        userId: user.id,
        agentId: agent.id,
        vaultSchemaId: schemaRecords.get(schemaName) ?? null,
        permissionType: "read",
        restrictionRules: encodeJson({ deniedPaths: [], maxRecords: 8, source: "seed-clearance" }),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    }
    await ensurePermission({
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: null,
      permissionType: "execute_action",
      restrictionRules: encodeJson({ requiresHitlForHighRisk: true, maxSpendingUsd: 250 }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  }
}

async function ensurePermission(input: {
  userId: string;
  agentId: string;
  vaultSchemaId: string | null;
  permissionType: "read" | "write" | "execute_action";
  restrictionRules: string;
  expiresAt: Date;
}) {
  const existing = await prisma.agentPermission.findFirst({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      vaultSchemaId: input.vaultSchemaId,
      permissionType: input.permissionType
    }
  });
  if (existing) {
    return prisma.agentPermission.update({ where: { id: existing.id }, data: input });
  }
  return prisma.agentPermission.create({ data: input });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
