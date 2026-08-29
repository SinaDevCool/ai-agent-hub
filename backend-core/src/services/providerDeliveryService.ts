import { createHash } from "node:crypto";
import { Prisma, type ProviderIdempotencyRecord } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { badRequest, httpError, notFound } from "../errors/httpError.js";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function providerRequestHash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

type IdempotencyClaimInput = {
  userId: string;
  providerId: string;
  idempotencyKey: string;
  request: unknown;
  ttlMs?: number;
};

function isTransientDatabaseContention(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P1008" || /socket timeout|database.*timeout|SQLITE_BUSY/i.test(error.message));
}

type IdempotencyClaimResult = { claimed: true; record: ProviderIdempotencyRecord } | { claimed: false; record: ProviderIdempotencyRecord };

async function claimProviderIdempotencyAttempt(input: IdempotencyClaimInput, contentionAttempt: number): Promise<IdempotencyClaimResult> {
  const key = input.idempotencyKey.trim();
  if (!key) throw badRequest("An idempotency key is required.");
  const requestHash = providerRequestHash(input.request);
  const existing = await prisma.providerIdempotencyRecord.findUnique({
    where: { userId_providerId_idempotencyKey: { userId: input.userId, providerId: input.providerId, idempotencyKey: key } }
  });
  if (existing) {
    if (existing.requestHash !== requestHash) throw httpError(409, "This idempotency key was already used with a different request.", "idempotency_conflict");
    return { claimed: false as const, record: existing };
  }
  try {
    const record = await prisma.providerIdempotencyRecord.create({ data: {
      userId: input.userId,
      providerId: input.providerId,
      idempotencyKey: key,
      requestHash,
      expiresAt: new Date(Date.now() + Math.max(60_000, input.ttlMs ?? 86_400_000))
    } });
    return { claimed: true as const, record };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return claimProviderIdempotencyAttempt(input, contentionAttempt);
    if (isTransientDatabaseContention(error) && contentionAttempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 25 * (contentionAttempt + 1)));
      return claimProviderIdempotencyAttempt(input, contentionAttempt + 1);
    }
    throw error;
  }
}

export function claimProviderIdempotency(input: IdempotencyClaimInput) {
  return claimProviderIdempotencyAttempt(input, 0);
}

export async function completeProviderIdempotency(input: {
  id: string;
  status: "completed" | "failed";
  response?: unknown;
  externalReference?: string;
}) {
  return prisma.providerIdempotencyRecord.update({ where: { id: input.id }, data: {
    status: input.status,
    responseJson: stable(input.response ?? {}),
    externalReference: input.externalReference
  } });
}

export async function beginProviderAttempt(input: {
  lifeTransactionId: string;
  providerId: string;
  action: string;
  attemptNumber: number;
  request?: unknown;
}) {
  if (input.attemptNumber < 1) throw badRequest("Attempt number must be at least one.");
  const transaction = await prisma.lifeTransaction.findUnique({ where: { id: input.lifeTransactionId }, select: { id: true } });
  if (!transaction) throw notFound("Life transaction not found.");
  return prisma.providerTransactionAttempt.create({ data: {
    lifeTransactionId: input.lifeTransactionId,
    providerId: input.providerId,
    action: input.action,
    attemptNumber: input.attemptNumber,
    status: "executing",
    requestJson: stable(input.request ?? {})
  } });
}

export async function finishProviderAttempt(input: {
  id: string;
  status: "confirmed" | "failed" | "pending";
  response?: unknown;
  externalReference?: string;
  failureCode?: string;
  failureMessage?: string;
}) {
  return prisma.providerTransactionAttempt.update({ where: { id: input.id }, data: {
    status: input.status,
    responseJson: stable(input.response ?? {}),
    externalReference: input.externalReference,
    failureCode: input.failureCode,
    failureMessage: input.failureMessage,
    completedAt: input.status === "pending" ? null : new Date()
  } });
}

export async function receiveProviderWebhook(input: {
  providerId: string;
  externalEventId: string;
  eventType: string;
  payload: unknown;
}) {
  try {
    const event = await prisma.providerWebhookEvent.create({ data: {
      providerId: input.providerId,
      externalEventId: input.externalEventId,
      eventType: input.eventType,
      payloadJson: stable(input.payload)
    } });
    return { duplicate: false as const, event };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: { providerId_externalEventId: { providerId: input.providerId, externalEventId: input.externalEventId } }
    });
    return { duplicate: true as const, event };
  }
}

export async function finishProviderWebhook(input: { id: string; succeeded: boolean; failureReason?: string }) {
  return prisma.providerWebhookEvent.update({ where: { id: input.id }, data: {
    status: input.succeeded ? "processed" : "failed",
    failureReason: input.succeeded ? null : input.failureReason ?? "Webhook processing failed.",
    processedAt: new Date()
  } });
}
