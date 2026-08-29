import type { DurableJob, DurableJobStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { decodeJson, encodeJson } from "./jsonService.js";

export const durableJobTypes = [
  "provider_webhook",
  "calcom_webhook",
  "calcom_reconciliation",
  "plaid_webhook",
  "plaid_reconciliation",
  "provider_reconciliation",
  "checkout_confirmation",
  "connector_subscription_renewal",
  "connector_delta_catchup",
  "token_refresh_recovery",
  "notification_delivery",
  "privacy_export",
  "privacy_deletion",
  "provider_health_check"
] as const;

export type DurableJobType = typeof durableJobTypes[number];
export type JobFailureClassification = "transient" | "rate_limited" | "permanent" | "uncertain";
export type JobHandlerResult =
  | { outcome: "succeeded" }
  | { outcome: "retry"; classification: "transient" | "rate_limited"; message: string; retryAfterMs?: number }
  | { outcome: "uncertain"; message: string }
  | { outcome: "permanent"; message: string };

type RegisteredHandler = {
  version: number;
  schema: z.ZodType<unknown>;
  execute: (input: { job: DurableJob; payload: unknown }) => Promise<JobHandlerResult>;
  canRetryDeadLetter?: (input: { job: DurableJob; payload: unknown }) => Promise<boolean> | boolean;
};

const handlers = new Map<string, RegisteredHandler>();
const secretKeyPattern = /token|secret|password|authorization|cookie|api[-_]?key|message[-_]?body|content/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !secretKeyPattern.test(key))
      .map(([key, item]) => [key, sanitize(item, depth + 1)]));
  }
  if (typeof value === "string") return value.slice(0, 4000);
  return value;
}

export function registerDurableJobHandler(jobType: DurableJobType, handler: RegisteredHandler) {
  handlers.set(jobType, handler);
}

export function unregisterDurableJobHandler(jobType: DurableJobType) {
  handlers.delete(jobType);
}

export async function enqueueDurableJob(input: {
  jobType: DurableJobType;
  dedupeKey: string;
  payload: unknown;
  userId?: string;
  aggregateType?: string;
  aggregateId?: string;
  correlationId?: string;
  priority?: number;
  scheduledAt?: Date;
  maxAttempts?: number;
}) {
  const existing = await prisma.durableJob.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return { job: existing, deduplicated: true };
  try {
    const job = await prisma.durableJob.create({ data: {
      jobType: input.jobType,
      dedupeKey: input.dedupeKey,
      payload: encodeJson(sanitize(input.payload)),
      userId: input.userId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      priority: Math.max(0, Math.min(1000, input.priority ?? 100)),
      scheduledAt: input.scheduledAt ?? new Date(),
      maxAttempts: Math.max(1, Math.min(25, input.maxAttempts ?? 5))
    } });
    return { job, deduplicated: false };
  } catch (error) {
    const raced = await prisma.durableJob.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (raced) return { job: raced, deduplicated: true };
    throw error;
  }
}

export async function recoverExpiredDurableJobLeases(now = new Date()) {
  return prisma.durableJob.updateMany({
    where: { status: "leased", leaseExpiresAt: { lt: now } },
    data: {
      status: "retry_scheduled",
      scheduledAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      lastErrorClassification: "transient",
      lastErrorMessage: "Worker lease expired before acknowledgement."
    }
  });
}

export async function claimDurableJobs(input: { workerId: string; limit?: number; leaseMs?: number; now?: Date }) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(100, input.limit ?? env.DURABLE_JOB_BATCH_SIZE));
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? env.DURABLE_JOB_LEASE_MS));
  await recoverExpiredDurableJobLeases(now);
  const candidates = await prisma.durableJob.findMany({
    where: { status: { in: ["queued", "retry_scheduled"] }, scheduledAt: { lte: now } },
    orderBy: [{ priority: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
    take: limit * 3
  });
  const claimed: DurableJob[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const result = await prisma.durableJob.updateMany({
      where: { id: candidate.id, status: { in: ["queued", "retry_scheduled"] }, scheduledAt: { lte: now } },
      data: {
        status: "leased",
        leaseOwner: input.workerId,
        leaseExpiresAt,
        heartbeatAt: now,
        startedAt: candidate.startedAt ?? now,
        attemptCount: { increment: 1 }
      }
    });
    if (result.count === 1) claimed.push(await prisma.durableJob.findUniqueOrThrow({ where: { id: candidate.id } }));
  }
  return claimed;
}

export async function heartbeatDurableJob(jobId: string, workerId: string, leaseMs = env.DURABLE_JOB_LEASE_MS) {
  const now = new Date();
  const result = await prisma.durableJob.updateMany({
    where: { id: jobId, status: "leased", leaseOwner: workerId, leaseExpiresAt: { gt: now } },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) }
  });
  return result.count === 1;
}

function retryDelayMs(attempt: number) {
  const base = Math.min(3_600_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return base + randomInt(0, Math.max(1, Math.floor(base * 0.25)));
}

async function finalizeClaim(job: DurableJob, workerId: string, result: JobHandlerResult) {
  const ownership = { id: job.id, status: "leased" as const, leaseOwner: workerId };
  const now = new Date();
  if (result.outcome === "succeeded") {
    await prisma.durableJob.updateMany({ where: ownership, data: { status: "succeeded", completedAt: now, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, lastErrorClassification: null, lastErrorMessage: null } });
    return;
  }
  if (result.outcome === "uncertain") {
    const updated = await prisma.durableJob.updateMany({ where: ownership, data: { status: "reconciliation_required", leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, lastErrorClassification: "uncertain", lastErrorMessage: result.message.slice(0, 1000) } });
    if (updated.count === 1) await enqueueDurableJob({
      jobType: "provider_reconciliation",
      dedupeKey: `${job.dedupeKey}:reconcile`,
      payload: { sourceJobId: job.id, aggregateType: job.aggregateType, aggregateId: job.aggregateId },
      userId: job.userId ?? undefined,
      aggregateType: job.aggregateType ?? undefined,
      aggregateId: job.aggregateId ?? undefined,
      correlationId: job.correlationId ?? undefined
    });
    return;
  }
  const exhausted = result.outcome === "permanent" || job.attemptCount >= job.maxAttempts;
  await prisma.durableJob.updateMany({ where: ownership, data: exhausted ? {
    status: "dead_letter",
    completedAt: now,
    deadLetteredAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    lastErrorClassification: result.outcome === "permanent" ? "permanent" : result.classification,
    lastErrorMessage: result.message.slice(0, 1000)
  } : {
    status: "retry_scheduled",
    scheduledAt: new Date(now.getTime() + (result.retryAfterMs ?? retryDelayMs(job.attemptCount))),
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    lastErrorClassification: result.classification,
    lastErrorMessage: result.message.slice(0, 1000)
  } });
}

export async function executeClaimedDurableJob(job: DurableJob, workerId: string) {
  const handler = handlers.get(job.jobType);
  if (!handler) {
    await finalizeClaim(job, workerId, { outcome: "permanent", message: `No handler is registered for ${job.jobType}.` });
    return;
  }
  if (handler.version !== job.jobVersion) {
    await finalizeClaim(job, workerId, { outcome: "permanent", message: `Unsupported ${job.jobType} payload version ${job.jobVersion}.` });
    return;
  }
  const parsed = handler.schema.safeParse(decodeJson(job.payload, null));
  if (!parsed.success) {
    await finalizeClaim(job, workerId, { outcome: "permanent", message: "Stored job payload does not match its registered version." });
    return;
  }
  const heartbeat = setInterval(() => {
    void heartbeatDurableJob(job.id, workerId).catch((error) => logger.warn({ error, jobId: job.id, workerId, correlationId: job.correlationId }, "Durable job heartbeat failed"));
  }, Math.max(1000, Math.floor(env.DURABLE_JOB_LEASE_MS / 3)));
  try {
    logger.info({ jobId: job.id, jobType: job.jobType, attempt: job.attemptCount, workerId, correlationId: job.correlationId }, "Durable job execution started");
    await finalizeClaim(job, workerId, await handler.execute({ job, payload: parsed.data }));
  } catch (error) {
    await finalizeClaim(job, workerId, { outcome: "retry", classification: "transient", message: error instanceof Error ? error.message : "Unhandled job error." });
  } finally {
    globalThis.clearInterval(heartbeat);
    logger.info({ jobId: job.id, jobType: job.jobType, attempt: job.attemptCount, workerId, correlationId: job.correlationId }, "Durable job execution finished");
  }
}

export async function processDurableJobBatch(workerId: string) {
  if (env.DURABLE_JOBS_ENABLED !== "true") return { enabled: false, claimed: 0 };
  const jobs = await claimDurableJobs({ workerId });
  await Promise.all(jobs.map((job) => executeClaimedDurableJob(job, workerId)));
  return { enabled: true, claimed: jobs.length };
}

export async function listDurableJobs(input: { status?: DurableJobStatus; jobType?: string; limit?: number }) {
  return prisma.durableJob.findMany({
    where: { status: input.status, jobType: input.jobType },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, input.limit ?? 50))
  });
}

export async function getDurableJob(jobId: string) {
  return prisma.durableJob.findUnique({ where: { id: jobId } });
}

export async function getDurableJobStats() {
  const grouped = await prisma.durableJob.groupBy({ by: ["status"], _count: { _all: true } });
  const oldest = await prisma.durableJob.findFirst({ where: { status: { in: ["queued", "retry_scheduled", "reconciliation_required"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return { counts: Object.fromEntries(grouped.map((item) => [item.status, item._count._all])), oldestPendingAt: oldest?.createdAt ?? null };
}

export async function cancelDurableJob(jobId: string) {
  const result = await prisma.durableJob.updateMany({ where: { id: jobId, status: { in: ["queued", "retry_scheduled", "reconciliation_required"] } }, data: { status: "cancelled", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
  if (result.count !== 1) throw httpError(409, "Only pending durable jobs can be cancelled.", "durable_job_not_cancellable");
  return prisma.durableJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function rescheduleDurableJob(jobId: string, scheduledAt: Date) {
  const result = await prisma.durableJob.updateMany({ where: { id: jobId, status: { in: ["queued", "retry_scheduled"] } }, data: { status: "retry_scheduled", scheduledAt } });
  if (result.count !== 1) throw httpError(409, "Only queued jobs can be rescheduled.", "durable_job_not_reschedulable");
  return prisma.durableJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function retryDeadLetterDurableJob(jobId: string) {
  const job = await prisma.durableJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "dead_letter") throw httpError(409, "Only dead-letter jobs can be retried.", "durable_job_not_retryable");
  const handler = handlers.get(job.jobType);
  const payload = decodeJson(job.payload, null);
  if (!handler?.canRetryDeadLetter || !await handler.canRetryDeadLetter({ job, payload })) {
    throw httpError(409, "This job type is not safe for operator retry.", "durable_job_retry_unsafe");
  }
  return prisma.durableJob.update({ where: { id: jobId }, data: { status: "retry_scheduled", scheduledAt: new Date(), attemptCount: 0, completedAt: null, deadLetteredAt: null, lastErrorClassification: null, lastErrorMessage: null } });
}

export function serializeDurableJob(job: DurableJob) {
  return { ...job, payload: undefined, payloadSummary: { redacted: true, bytes: Buffer.byteLength(job.payload) } };
}
