import { PrismaClient, type AgentCategory } from "@prisma/client";
import path from "node:path";
import { createVaultSalt } from "../src/services/cryptoService.js";
import { encodeJson } from "../src/services/jsonService.js";
import { reindexVault } from "../src/services/vaultIndexService.js";

const prisma = new PrismaClient();

const vaultPath = path.resolve(process.cwd(), "vault-samples/personal-vault");
const includeSampleUser = process.env.SEED_INCLUDE_SAMPLE_USER === "true" || process.argv.includes("--sample-user");

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
  },
  {
    name: "Career Profile",
    description: "Resume facts, work preferences, portfolio links, and job-search boundaries.",
    structuralTemplate: {
      fields: ["resumeHighlights", "targetRoles", "portfolioLinks", "salaryBoundaries", "locationPreferences"]
    }
  },
  {
    name: "Home Preferences",
    description: "Household preferences, maintenance notes, subscriptions, and vendor rules.",
    structuralTemplate: {
      fields: ["homeAddress", "preferredVendors", "subscriptionRules", "maintenanceHistory", "shoppingPreferences"]
    }
  }
];

type SeedAgent = {
  name: string;
  category: AgentCategory;
  tagline: string;
  description: string;
  trustScore: number;
  installCount: number;
  averageRating: number;
  capabilityManifest: Record<string, unknown>;
};

const agents: SeedAgent[] = [
  {
    name: "Trip Companion",
    category: "Travel",
    tagline: "Plans trips around your preferences and pauses before bookings.",
    description: "Compare destinations, build itineraries, use loyalty details, and prepare booking choices without making non-refundable travel decisions until you approve.",
    trustScore: 86,
    installCount: 1420,
    averageRating: 4.7,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Personal Identity Profile", "Frequent Flyer Ledger"],
      highRiskActions: ["book_non_refundable_travel"],
      description: "Plans trips around your preferences and pauses before bookings.",
      examplePrompts: ["Plan a weekend trip using my preferences", "Compare flight options using my loyalty programs", "Build a three-day itinerary near public transit"],
      trustReasons: ["Shows which travel notes it used", "Cannot book non-refundable travel without approval", "Keeps identity details restricted until granted"]
    }
  },
  {
    name: "Budget Guard",
    category: "Financial",
    tagline: "Helps with budgets, card choices, and spending guardrails.",
    description: "Review spending preferences, compare card or payment choices, and flag decisions that should wait for your approval.",
    trustScore: 81,
    installCount: 1188,
    averageRating: 4.5,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Financial Preferences"],
      highRiskActions: ["open_credit_card", "transfer_funds"],
      description: "Helps with budgets, card choices, and spending guardrails.",
      examplePrompts: ["Find the spending rule I should follow", "Compare which card fits this purchase", "Tell me if this payment needs approval"],
      trustReasons: ["Cannot move money without approval", "Uses only financial preferences you allow", "Explains blocked or risky finance actions"]
    }
  },
  {
    name: "Daily Task Helper",
    category: "Executive",
    tagline: "Turns loose errands, reminders, and follow-ups into a simple plan.",
    description: "Organize everyday tasks, draft checklists, and coordinate reminders using only the personal context you choose to share.",
    trustScore: 89,
    installCount: 2034,
    averageRating: 4.8,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Personal Identity Profile"],
      highRiskActions: ["share_personal_info"],
      description: "Turns loose errands, reminders, and follow-ups into a simple plan.",
      examplePrompts: ["Make a plan for my errands today", "Turn this messy note into a checklist", "Draft a follow-up reminder"],
      trustReasons: ["Can work without broad account access", "Asks before sharing personal details", "Receipts show what context was used"]
    }
  },
  {
    name: "Shopping Scout",
    category: "Domestic",
    tagline: "Compares products and subscriptions without surprise purchases.",
    description: "Use preferences and budget rules to compare items, audit subscriptions, and prepare buying options while purchases stay approval-gated.",
    trustScore: 74,
    installCount: 876,
    averageRating: 4.2,
    capabilityManifest: {
      protocol: "OpenAPI",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Financial Preferences", "Home Preferences"],
      highRiskActions: ["buy_item", "share_payment_info"],
      description: "Compares products and subscriptions without surprise purchases.",
      examplePrompts: ["Compare these options against my preferences", "Find subscriptions I should review", "Help me choose without buying anything"],
      trustReasons: ["Cannot buy items without approval", "Keeps payment info gated", "Shows preference and budget rules it used"]
    }
  },
  {
    name: "Health Notes Organizer",
    category: "Wellness",
    tagline: "Organizes health notes while keeping sensitive details tightly controlled.",
    description: "Summarize saved health context, prepare questions for appointments, and keep medical details private unless you explicitly allow access.",
    trustScore: 92,
    installCount: 642,
    averageRating: 4.6,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search"],
      requestedSchemas: ["Medical History", "Personal Identity Profile"],
      highRiskActions: ["share_medical_record"],
      description: "Organizes health notes while keeping sensitive details tightly controlled.",
      examplePrompts: ["Summarize the health note I saved", "Prepare questions for my next appointment", "Find allergy details in my private notes"],
      trustReasons: ["Read-only by default", "Health sharing is approval-gated", "Uses narrow medical permissions"]
    }
  },
  {
    name: "Job Application Coach",
    category: "Executive",
    tagline: "Helps tailor resumes, cover letters, and application follow-ups.",
    description: "Use your career profile to draft application materials, compare job fit, and prepare follow-ups without submitting anything on your behalf.",
    trustScore: 88,
    installCount: 991,
    averageRating: 4.7,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "email.search", "email.draft_reply"],
      requestedSchemas: ["Career Profile", "Personal Identity Profile"],
      highRiskActions: ["submit_job_application", "share_personal_info", "send_email"],
      description: "Helps tailor resumes, cover letters, and application follow-ups.",
      examplePrompts: ["Tailor my resume summary for this role", "Draft a cover letter using my career profile", "Write a polite application follow-up"],
      trustReasons: ["Drafts but does not submit applications", "Asks before sharing identity details", "Keeps career data permissioned"]
    }
  },
  {
    name: "Inbox Follow-Up Helper",
    category: "Executive",
    tagline: "Drafts replies and follow-ups in your preferred tone.",
    description: "Prepare email drafts, summarize open loops, and create polite follow-ups while sending remains under your control.",
    trustScore: 84,
    installCount: 1356,
    averageRating: 4.4,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "email.search", "email.draft_reply", "calendar.find_free_time"],
      requestedSchemas: ["Personal Identity Profile", "Career Profile"],
      highRiskActions: ["send_email", "share_personal_info"],
      description: "Drafts replies and follow-ups in your preferred tone.",
      examplePrompts: ["Draft a polite follow-up email", "Summarize what I still owe this person", "Rewrite this reply in my usual tone"],
      trustReasons: ["Draft-only email behavior", "Asks before sharing personal details", "Shows what profile context shaped the draft"]
    }
  },
  {
    name: "Home Maintenance Helper",
    category: "Maintenance",
    tagline: "Keeps home tasks, repairs, and vendor notes organized.",
    description: "Track household maintenance, prepare repair checklists, compare vendors, and pause before booking or sharing your address.",
    trustScore: 83,
    installCount: 711,
    averageRating: 4.3,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Home Preferences", "Personal Identity Profile"],
      highRiskActions: ["book_home_service", "share_home_address"],
      description: "Keeps home tasks, repairs, and vendor notes organized.",
      examplePrompts: ["Make a home maintenance checklist", "Compare repair options using my vendor rules", "Find the last note about this appliance"],
      trustReasons: ["Address sharing is approval-gated", "Can compare before booking", "Receipts show home info access"]
    }
  },
  {
    name: "Private Info Librarian",
    category: "Maintenance",
    tagline: "Finds and organizes your saved private notes.",
    description: "Clean up saved context, detect duplicates, and help you understand what private info exists before other helpers use it.",
    trustScore: 94,
    installCount: 1542,
    averageRating: 4.9,
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search"],
      requestedSchemas: ["Personal Identity Profile", "Financial Preferences", "Frequent Flyer Ledger", "Medical History", "Career Profile", "Home Preferences"],
      highRiskActions: [],
      description: "Finds and organizes your saved private notes.",
      examplePrompts: ["Find what private info I have saved", "Show duplicate or stale notes", "Summarize what helpers could ask to read"],
      trustReasons: ["Read-only helper", "No real-world actions", "Useful before granting other helpers access"]
    }
  }
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const sampleUser = includeSampleUser
    ? await prisma.user.upsert({
      where: { email: "local.user@local.ai" },
      update: { vaultLocalPath: vaultPath },
      create: {
        id: "local-clean-user",
        email: "local.user@local.ai",
        vaultLocalPath: vaultPath,
        vaultEncryptionSalt: createVaultSalt()
      }
    })
    : null;
  const sampleAgents = new Map<string, string>();

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
    const marketplaceAgent = await prisma.agentDefinition.upsert({
      where: { slug: slugify(agentData.name) },
      update: {
        name: agentData.name,
        tagline: agentData.tagline,
        description: agentData.description,
        category: agentData.category,
        trustScore: agentData.trustScore,
        status: "published"
      },
      create: {
        slug: slugify(agentData.name),
        name: agentData.name,
        tagline: agentData.tagline,
        description: agentData.description,
        category: agentData.category,
        trustScore: agentData.trustScore,
        installCount: agentData.installCount,
        averageRating: agentData.averageRating,
        status: "published"
      }
    });
    const marketplaceVersion = await prisma.agentVersion.upsert({
      where: { agentDefinitionId_version: { agentDefinitionId: marketplaceAgent.id, version: "1.0.0" } },
      update: {
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP",
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        isActive: true
      },
      create: {
        agentDefinitionId: marketplaceAgent.id,
        version: "1.0.0",
        apiProtocol: agentData.capabilityManifest.protocol === "OpenAPI" ? "OpenAPI" : "MCP",
        capabilityManifest: encodeJson(agentData.capabilityManifest),
        releaseNotes: "Seeded marketplace agent.",
        isActive: true
      }
    });

    if (!sampleUser) continue;

    const existingAgent = await prisma.agent.findFirst({
      where: { name: agentData.name, connections: { some: { userId: sampleUser.id } } }
    });
    const agent = existingAgent
      ? await prisma.agent.update({
        where: { id: existingAgent.id },
        data: {
          name: agentData.name,
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
      where: { userId_agentId: { userId: sampleUser.id, agentId: agent.id } },
      update: { connectionStatus: agent.name === "The Curator" ? "restricted" : "active" },
      create: {
        userId: sampleUser.id,
        agentId: agent.id,
        connectionStatus: agent.name === "The Curator" ? "restricted" : "active",
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    await prisma.userAgentInstall.upsert({
      where: { userId_agentDefinitionId: { userId: sampleUser.id, agentDefinitionId: marketplaceAgent.id } },
      update: {
        agentVersionId: marketplaceVersion.id,
        agentId: agent.id,
        displayName: agent.name,
        connectionStatus: agent.name === "The Curator" ? "restricted" : "active"
      },
      create: {
        userId: sampleUser.id,
        agentDefinitionId: marketplaceAgent.id,
        agentVersionId: marketplaceVersion.id,
        agentId: agent.id,
        displayName: agent.name,
        connectionStatus: agent.name === "The Curator" ? "restricted" : "active"
      }
    });
    sampleAgents.set(agent.name, agent.id);
    const requestedSchemas = agentData.capabilityManifest.requestedSchemas as string[];
    for (const schemaName of requestedSchemas) {
      await ensurePermission({
        userId: sampleUser.id,
        agentId: agent.id,
        vaultSchemaId: schemaRecords.get(schemaName) ?? null,
        permissionType: "read",
        restrictionRules: encodeJson({ deniedPaths: [], maxRecords: 8, source: "seed-clearance" }),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    }
    await ensurePermission({
      userId: sampleUser.id,
      agentId: agent.id,
      vaultSchemaId: null,
      permissionType: "execute_action",
      restrictionRules: encodeJson({ requiresHitlForHighRisk: true, maxSpendingUsd: 250 }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  }

  if (sampleUser) {
    await seedSampleProviderReceipts(sampleUser.id, sampleAgents);
    await reindexVault(sampleUser.id);
  }
}

async function seedSampleProviderReceipts(userId: string, sampleAgents: Map<string, string>) {
  const now = Date.now();
  const receipts = [
    {
      agentName: "Trip Companion",
      providerId: "sample-booking-workflow",
      providerLabel: "Travel booking workflow",
      capabilityKey: "travel.search_hotels",
      capabilityLabel: "Find hotels",
      action: "search",
      status: "succeeded",
      approvalRequired: false,
      resultQuality: "complete",
      userMessage: "Trip Companion compared hotel options near transit and found three strong matches.",
      technicalMessage: null,
      retryable: false,
      nextAction: "review_options",
      itemCount: 3,
      externalRequestId: "sample-travel-hotels-1",
      endpointHost: "booking-workflow.example.test",
      metadata: { destination: "Lisbon", nights: 4, resultCount: 3 },
      createdAt: new Date(now - 6 * 60 * 60 * 1000)
    },
    {
      agentName: "Trip Companion",
      providerId: "sample-booking-workflow",
      providerLabel: "Travel booking workflow",
      capabilityKey: "travel.book_hotel",
      capabilityLabel: "Book hotel",
      action: "execute_action",
      status: "waiting_for_approval",
      approvalRequired: true,
      resultQuality: null,
      userMessage: "Trip Companion paused before booking a non-refundable hotel. Nothing was booked.",
      technicalMessage: null,
      retryable: false,
      nextAction: "review_approval",
      itemCount: 1,
      externalRequestId: "sample-booking-approval-1",
      endpointHost: "booking-workflow.example.test",
      metadata: { destination: "Lisbon", estimatedTotal: 420 },
      createdAt: new Date(now - 5 * 60 * 60 * 1000)
    },
    {
      agentName: "Budget Guard",
      providerId: "sample-finance-workflow",
      providerLabel: "Budget workflow",
      capabilityKey: "money.compare_payment",
      capabilityLabel: "Compare payment options",
      action: "search",
      status: "blocked",
      approvalRequired: false,
      resultQuality: "blocked",
      userMessage: "Budget Guard did not continue because the finance workflow needs a connected account.",
      technicalMessage: "Sample blocked receipt for missing provider account.",
      retryable: true,
      nextAction: "connect_account",
      itemCount: 0,
      externalRequestId: "sample-finance-blocked-1",
      endpointHost: "finance-workflow.example.test",
      metadata: { category: "finance", retryable: true },
      createdAt: new Date(now - 4 * 60 * 60 * 1000)
    },
    {
      agentName: "Health Notes Organizer",
      providerId: "sample-health-workflow",
      providerLabel: "Health notes workflow",
      capabilityKey: "health.summarize_notes",
      capabilityLabel: "Summarize health notes",
      action: "search",
      status: "succeeded",
      approvalRequired: false,
      resultQuality: "partial",
      userMessage: "Health Notes Organizer summarized approved health notes without sharing medical records externally.",
      technicalMessage: null,
      retryable: false,
      nextAction: "ask_follow_up",
      itemCount: 2,
      externalRequestId: "sample-health-summary-1",
      endpointHost: "health-workflow.example.test",
      metadata: { usedApprovedInfoOnly: true, resultCount: 2 },
      createdAt: new Date(now - 3 * 60 * 60 * 1000)
    }
  ];
  const sampleProviderIds = receipts.map((receipt) => receipt.providerId);
  await prisma.providerReceipt.deleteMany({
    where: {
      userId,
      providerId: { in: sampleProviderIds }
    }
  });
  for (const receipt of receipts) {
    const agentId = sampleAgents.get(receipt.agentName);
    if (!agentId) continue;
    await prisma.providerReceipt.create({
      data: {
        userId,
        agentId,
        providerId: receipt.providerId,
        providerLabel: receipt.providerLabel,
        capabilityKey: receipt.capabilityKey,
        capabilityLabel: receipt.capabilityLabel,
        action: receipt.action,
        status: receipt.status,
        approvalRequired: receipt.approvalRequired,
        resultQuality: receipt.resultQuality,
        userMessage: receipt.userMessage,
        technicalMessage: receipt.technicalMessage,
        retryable: receipt.retryable,
        nextAction: receipt.nextAction,
        itemCount: receipt.itemCount,
        externalRequestId: receipt.externalRequestId,
        endpointHost: receipt.endpointHost,
        metadata: encodeJson(receipt.metadata),
        createdAt: receipt.createdAt
      }
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
