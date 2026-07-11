import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";

const creatorProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).default("")
});

export type CreatorProfileInput = z.input<typeof creatorProfileSchema>;

type CreatorProfile = Prisma.CreatorProfileGetPayload<Record<string, never>>;

function parseCreatorProfileInput(input: CreatorProfileInput) {
  const parsed = creatorProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw httpError(400, "Creator profile details are invalid.", "validation_error");
  }
  return parsed.data;
}

function serializeCreatorProfile(profile: CreatorProfile) {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    verified: profile.verified,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

export async function getCreatorProfile(userId: string) {
  const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  return profile ? serializeCreatorProfile(profile) : null;
}

export async function upsertCreatorProfile(userId: string, input: CreatorProfileInput) {
  const data = parseCreatorProfileInput(input);
  const profile = await prisma.creatorProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data }
  });
  return serializeCreatorProfile(profile);
}

export async function ensureCreatorProfile(userId: string) {
  const existing = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const fallbackName = user?.email?.split("@")[0] || "Creator";
  return prisma.creatorProfile.create({
    data: {
      userId,
      displayName: fallbackName.slice(0, 80),
      bio: ""
    }
  });
}
