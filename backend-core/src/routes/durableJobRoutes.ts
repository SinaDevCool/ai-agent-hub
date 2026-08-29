import { Router } from "express";
import { z } from "zod";
import { writeActivityLog } from "../services/activityLogService.js";
import {
  cancelDurableJob,
  enqueueDurableJob,
  getDurableJob,
  getDurableJobStats,
  listDurableJobs,
  rescheduleDurableJob,
  retryDeadLetterDurableJob,
  serializeDurableJob
} from "../services/durableJobService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";

export const durableJobRoutes = Router();

const listSchema = z.object({
  status: z.enum(["queued", "leased", "retry_scheduled", "reconciliation_required", "succeeded", "cancelled", "dead_letter"]).optional(),
  jobType: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

async function audit(userId: string, jobId: string, operation: string) {
  await writeActivityLog({
    userId,
    actionType: "execution_triggered",
    status: "success",
    dynamicMetadata: { durableJobId: jobId, operation }
  });
}

durableJobRoutes.get("/", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  const query = listSchema.parse(req.query);
  const jobs = await listDurableJobs(query);
  res.json({ jobs: jobs.map(serializeDurableJob) });
});

durableJobRoutes.get("/stats", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  res.json({ stats: await getDurableJobStats() });
});

durableJobRoutes.post("/:id/cancel", async (req, res) => {
  const actor = await requireModerateMarketplaceCapability(req.userId);
  const job = await cancelDurableJob(req.params.id);
  await audit(actor.user.id, job.id, "cancel");
  res.json({ job: serializeDurableJob(job) });
});

durableJobRoutes.post("/:id/reschedule", async (req, res) => {
  const actor = await requireModerateMarketplaceCapability(req.userId);
  const body = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
  const job = await rescheduleDurableJob(req.params.id, new Date(body.scheduledAt));
  await audit(actor.user.id, job.id, "reschedule");
  res.json({ job: serializeDurableJob(job) });
});

durableJobRoutes.post("/:id/retry", async (req, res) => {
  const actor = await requireModerateMarketplaceCapability(req.userId);
  const job = await retryDeadLetterDurableJob(req.params.id);
  await audit(actor.user.id, job.id, "retry_dead_letter");
  res.json({ job: serializeDurableJob(job) });
});

durableJobRoutes.post("/:id/reconcile", async (req, res) => {
  const actor = await requireModerateMarketplaceCapability(req.userId);
  const source = await getDurableJob(req.params.id);
  if (!source) return res.status(404).json({ error: { code: "durable_job_not_found", message: "Durable job not found." } });
  const result = await enqueueDurableJob({
    jobType: "provider_reconciliation",
    dedupeKey: `${source.dedupeKey}:operator-reconcile:${Date.now()}`,
    payload: { sourceJobId: source.id, aggregateType: source.aggregateType, aggregateId: source.aggregateId },
    userId: source.userId ?? undefined,
    aggregateType: source.aggregateType ?? undefined,
    aggregateId: source.aggregateId ?? undefined,
    correlationId: source.correlationId ?? undefined,
    priority: 10
  });
  await audit(actor.user.id, source.id, "reconcile_now");
  res.status(201).json({ job: serializeDurableJob(result.job) });
});
