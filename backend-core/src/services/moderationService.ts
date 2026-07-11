import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { capabilityManifestSchema } from "./creatorManifestSchema.js";
import { encodeJson } from "./jsonService.js";
import { serializeAgentDefinition } from "./serializerService.js";
import { canModerateMarketplace } from "./userCapabilityService.js";

const moderationNoteSchema = z.object({
  note: z.string().trim().min(8).max(500)
});

const moderationAgentInclude = {
  creator: true,
  versions: { orderBy: { createdAt: "desc" as const } }
};

type ModerationAgent = Prisma.AgentDefinitionGetPayload<{ include: typeof moderationAgentInclude }>;

async function assertModerator(userId: string) {
  if (!(await canModerateMarketplace(userId))) {
    throw httpError(403, "Moderator access is required.", "moderator_access_required");
  }
}

function parseStoredManifest(value: string) {
  try {
    return capabilityManifestSchema.parse(JSON.parse(value));
  } catch {
    throw httpError(400, "Capability manifest is not ready for approval.", "invalid_capability_manifest");
  }
}

async function findReviewAgent(agentDefinitionId: string): Promise<ModerationAgent> {
  const definition = await prisma.agentDefinition.findUnique({
    where: { id: agentDefinitionId },
    include: moderationAgentInclude
  });
  if (!definition) throw httpError(404, "Review helper not found.", "moderation_agent_not_found");
  if (definition.status !== "needs_review") {
    throw httpError(409, "Only helpers waiting for review can be moderated.", "moderation_agent_not_in_review");
  }
  return definition;
}

export async function listModerationAgents(userId: string) {
  await assertModerator(userId);
  const definitions = await prisma.agentDefinition.findMany({
    where: { status: "needs_review" },
    include: moderationAgentInclude,
    orderBy: [{ submittedForReviewAt: "asc" }, { updatedAt: "asc" }]
  });
  return definitions.map(serializeAgentDefinition);
}

export async function approveModerationAgent(userId: string, agentDefinitionId: string) {
  await assertModerator(userId);
  const existing = await findReviewAgent(agentDefinitionId);
  const version = existing.versions[0];
  if (!version) {
    throw httpError(409, "This helper needs a version before approval.", "moderation_agent_missing_version");
  }
  const manifest = parseStoredManifest(version.capabilityManifest);
  if (version.apiProtocol !== manifest.protocol) {
    throw httpError(400, "API protocol must match the capability manifest protocol.", "protocol_mismatch");
  }

  const definition = await prisma.$transaction(async (tx) => {
    await tx.agentVersion.updateMany({
      where: { agentDefinitionId: existing.id },
      data: { isActive: false }
    });
    await tx.agentVersion.update({
      where: { id: version.id },
      data: {
        isActive: true,
        capabilityManifest: encodeJson(manifest.sourceType === "native"
          ? manifest
          : {
              ...manifest,
              verificationStatus: "verified",
              verificationSummary: Array.from(new Set([
                ...manifest.verificationSummary,
                "Marketplace moderator verified the declared external source before approval."
              ]))
            })
      }
    });
    await tx.agentDefinition.update({
      where: { id: existing.id },
      data: {
        status: "published",
        moderationNote: "",
        reviewedAt: new Date(),
        reviewedByUserId: userId
      }
    });
    return tx.agentDefinition.findUniqueOrThrow({
      where: { id: existing.id },
      include: moderationAgentInclude
    });
  });
  return serializeAgentDefinition(definition);
}

export async function sendBackModerationAgent(userId: string, agentDefinitionId: string, input: unknown) {
  await assertModerator(userId);
  const { note } = moderationNoteSchema.parse(input);
  const existing = await findReviewAgent(agentDefinitionId);
  const definition = await prisma.$transaction(async (tx) => {
    await tx.agentVersion.updateMany({
      where: { agentDefinitionId: existing.id },
      data: { isActive: false }
    });
    await tx.agentDefinition.update({
      where: { id: existing.id },
      data: {
        status: "draft",
        moderationNote: note,
        reviewedAt: new Date(),
        reviewedByUserId: userId
      }
    });
    return tx.agentDefinition.findUniqueOrThrow({
      where: { id: existing.id },
      include: moderationAgentInclude
    });
  });
  return serializeAgentDefinition(definition);
}
