import type { ApiProtocol, MarketplaceStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { evaluateMarketplaceReadiness, getMarketplaceReadinessItems } from "./creatorListingReadinessService.js";
import { agentDraftSchema, capabilityManifestSchema, type CreatorAgentDraftInput } from "./creatorManifestSchema.js";
import { ensureCreatorProfile } from "./creatorProfileService.js";
import { encodeJson } from "./jsonService.js";
import { serializeAgentDefinition } from "./serializerService.js";

const creatorAgentInclude = {
  creator: true,
  versions: { orderBy: { createdAt: "desc" as const } }
};

function parseOrBadRequest<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  message = "Check the details and try again."
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw httpError(400, message, "validation_error");
  }
  return parsed.data;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "helper";
}

async function generateUniqueSlug(name: string, excludeDefinitionId?: string) {
  const base = slugify(name);
  for (let index = 1; index < 100; index += 1) {
    const candidate = index === 1 ? base : `${base}-${index}`;
    const existing = await prisma.agentDefinition.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });
    if (!existing || existing.id === excludeDefinitionId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function assertKnownSchemas(requestedSchemas: string[]) {
  if (!requestedSchemas.length) return;
  const schemas = await prisma.vaultSchema.findMany({
    where: { name: { in: requestedSchemas } },
    select: { name: true }
  });
  const knownNames = new Set(schemas.map((schema) => schema.name));
  const unknown = requestedSchemas.filter((schemaName) => !knownNames.has(schemaName));
  if (unknown.length) {
    throw httpError(400, `Unknown private info category: ${unknown.join(", ")}`, "unknown_requested_schema");
  }
}

function assertProtocolMatches(apiProtocol: ApiProtocol, manifestProtocol: "MCP" | "OpenAPI") {
  if (apiProtocol !== manifestProtocol) {
    throw httpError(400, "API protocol must match the capability manifest protocol.", "protocol_mismatch");
  }
}

function parseStoredManifest(value: string) {
  try {
    return capabilityManifestSchema.parse(JSON.parse(value));
  } catch {
    throw httpError(400, "Capability manifest is not ready for publishing.", "invalid_capability_manifest");
  }
}

async function findOwnedDefinition(userId: string, agentDefinitionId: string) {
  const definition = await prisma.agentDefinition.findFirst({
    where: {
      id: agentDefinitionId,
      creator: { userId }
    },
    include: creatorAgentInclude
  });
  if (!definition) throw httpError(404, "Creator helper not found.", "creator_agent_not_found");
  return definition;
}

export async function listCreatorAgents(userId: string) {
  const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) return [];
  const definitions = await prisma.agentDefinition.findMany({
    where: { creatorId: profile.id },
    include: creatorAgentInclude,
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });
  return definitions.map(serializeAgentDefinition);
}

export async function createCreatorAgentDraft(userId: string, input: CreatorAgentDraftInput) {
  const data = parseOrBadRequest(agentDraftSchema, input, "Creator helper details are invalid.");
  assertProtocolMatches(data.apiProtocol, data.capabilityManifest.protocol);
  await assertKnownSchemas(data.capabilityManifest.requestedSchemas);
  const profile = await ensureCreatorProfile(userId);
  const slug = await generateUniqueSlug(data.name);

  const definition = await prisma.agentDefinition.create({
    data: {
      creatorId: profile.id,
      slug,
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      category: data.category,
      status: "draft",
      trustScore: 70,
      installCount: 0,
      averageRating: 0,
      versions: {
        create: {
          version: "1.0.0",
          apiProtocol: data.apiProtocol,
          capabilityManifest: encodeJson(data.capabilityManifest),
          releaseNotes: data.releaseNotes,
          isActive: false
        }
      }
    },
    include: creatorAgentInclude
  });
  return serializeAgentDefinition(definition);
}

export async function updateCreatorAgentDraft(userId: string, agentDefinitionId: string, input: Partial<CreatorAgentDraftInput>) {
  const existing = await findOwnedDefinition(userId, agentDefinitionId);
  if (existing.status !== "draft" && existing.status !== "needs_review") {
    throw httpError(409, "Only draft or review helpers can be edited.", "creator_agent_not_draft");
  }

  const currentVersion = existing.versions[0];
  if (!currentVersion) {
    throw httpError(409, "This helper needs a version before it can be edited.", "creator_agent_missing_version");
  }

  const currentManifest = parseStoredManifest(currentVersion.capabilityManifest);
  const merged = parseOrBadRequest(agentDraftSchema, {
    name: input.name ?? existing.name,
    tagline: input.tagline ?? existing.tagline,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    apiProtocol: input.apiProtocol ?? currentVersion.apiProtocol,
    capabilityManifest: input.capabilityManifest ?? currentManifest,
    releaseNotes: input.releaseNotes ?? currentVersion.releaseNotes
  }, "Creator helper details are invalid.");
  assertProtocolMatches(merged.apiProtocol, merged.capabilityManifest.protocol);
  await assertKnownSchemas(merged.capabilityManifest.requestedSchemas);
  const slug = merged.name === existing.name ? existing.slug : await generateUniqueSlug(merged.name, existing.id);

  const definition = await prisma.$transaction(async (tx) => {
    await tx.agentDefinition.update({
      where: { id: existing.id },
      data: {
        slug,
        name: merged.name,
        tagline: merged.tagline,
        description: merged.description,
        category: merged.category,
        status: "draft" as MarketplaceStatus,
        moderationNote: existing.moderationNote,
        submittedForReviewAt: existing.status === "needs_review" ? null : existing.submittedForReviewAt,
        reviewedAt: existing.reviewedAt,
        reviewedByUserId: existing.reviewedByUserId
      }
    });
    await tx.agentVersion.update({
      where: { id: currentVersion.id },
      data: {
        apiProtocol: merged.apiProtocol,
        capabilityManifest: encodeJson(merged.capabilityManifest),
        releaseNotes: merged.releaseNotes,
        isActive: false
      }
    });
    return tx.agentDefinition.findUniqueOrThrow({
      where: { id: existing.id },
      include: creatorAgentInclude
    });
  });
  return serializeAgentDefinition(definition);
}

function assertPublishable(definition: Prisma.AgentDefinitionGetPayload<{ include: typeof creatorAgentInclude }>) {
  if (definition.status !== "draft") {
    throw httpError(409, "Only draft helpers can be published.", "creator_agent_not_draft");
  }
  const version = definition.versions[0];
  if (!version) {
    throw httpError(409, "This helper needs a version before publishing.", "creator_agent_missing_version");
  }
  const manifest = parseStoredManifest(version.capabilityManifest);
  assertProtocolMatches(version.apiProtocol, manifest.protocol);
  return version;
}

export async function publishCreatorAgent(userId: string, agentDefinitionId: string) {
  const existing = await findOwnedDefinition(userId, agentDefinitionId);
  const version = assertPublishable(existing);
  const manifest = parseStoredManifest(version.capabilityManifest);
  await assertKnownSchemas(manifest.requestedSchemas);
  const readiness = evaluateMarketplaceReadiness({
    name: existing.name,
    tagline: existing.tagline,
    description: existing.description,
    capabilityManifest: manifest
  });

  if (readiness.outcome === "block") {
    throw httpError(400, readiness.message, readiness.code);
  }

  const definition = await prisma.$transaction(async (tx) => {
    await tx.agentVersion.updateMany({
      where: { agentDefinitionId: existing.id },
      data: { isActive: false }
    });
    if (readiness.outcome === "publish") {
      await tx.agentVersion.update({
        where: { id: version.id },
        data: { isActive: true }
      });
    }
    await tx.agentDefinition.update({
      where: { id: existing.id },
      data: readiness.outcome === "publish"
        ? {
            status: "published",
            moderationNote: "",
            submittedForReviewAt: null,
            reviewedAt: null,
            reviewedByUserId: null
          }
        : {
            status: "needs_review",
            moderationNote: readiness.message,
            submittedForReviewAt: new Date(),
            reviewedAt: null,
            reviewedByUserId: null
          }
    });
    return tx.agentDefinition.findUniqueOrThrow({
      where: { id: existing.id },
      include: creatorAgentInclude
    });
  });
  return {
    agent: serializeAgentDefinition(definition),
    readiness: {
      outcome: readiness.outcome,
      message: readiness.message,
      code: readiness.code,
      items: readiness.items
    }
  };
}

export async function getCreatorAgentReadiness(userId: string, agentDefinitionId: string) {
  const existing = await findOwnedDefinition(userId, agentDefinitionId);
  const version = existing.versions[0];
  if (!version) {
    return {
      outcome: "block" as const,
      message: "Save a version before submitting.",
      code: "creator_agent_missing_version",
      items: getMarketplaceReadinessItems({
        name: existing.name,
        tagline: existing.tagline,
        description: existing.description,
        category: existing.category,
        capabilityManifest: {
          protocol: "MCP",
          sourceType: "native",
          verificationStatus: "declared",
          verificationSummary: [],
          tools: [],
          requestedSchemas: [],
          highRiskActions: [],
          description: existing.description,
          examplePrompts: [],
          trustReasons: []
        },
        hasVersion: false
      })
    };
  }
  const manifest = parseStoredManifest(version.capabilityManifest);
  return evaluateMarketplaceReadiness({
    name: existing.name,
    tagline: existing.tagline,
    description: existing.description,
    capabilityManifest: manifest
  });
}

export async function archiveCreatorAgent(userId: string, agentDefinitionId: string) {
  const existing = await findOwnedDefinition(userId, agentDefinitionId);
  if (existing.status === "archived") return serializeAgentDefinition(existing);

  const definition = await prisma.agentDefinition.update({
    where: { id: existing.id },
    data: { status: "archived" as MarketplaceStatus },
    include: creatorAgentInclude
  });
  return serializeAgentDefinition(definition);
}
