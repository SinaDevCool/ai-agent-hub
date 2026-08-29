import { deploymentInfo, env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { getDurableJobStats } from "./durableJobService.js";

export type OperationalSignals = {
  deadLetterJobs: number;
  reconciliationJobs: number;
  oldestPendingMinutes: number | null;
  providerFailures15m: number;
  failedPrivacyRequests: number;
  appointmentWebhookPending: number;
  appointmentWebhookDeadLetter: number;
};

export function evaluateOperationalSignals(signals: OperationalSignals) {
  const alerts: Array<{ key: string; severity: "warning" | "critical"; value: number; threshold: number }> = [];
  if (signals.deadLetterJobs >= env.OPS_ALERT_DEAD_LETTER_WARN) alerts.push({ key: "dead_letter_jobs", severity: "critical", value: signals.deadLetterJobs, threshold: env.OPS_ALERT_DEAD_LETTER_WARN });
  if (signals.reconciliationJobs >= env.OPS_ALERT_RECONCILIATION_WARN) alerts.push({ key: "reconciliation_jobs", severity: "warning", value: signals.reconciliationJobs, threshold: env.OPS_ALERT_RECONCILIATION_WARN });
  if ((signals.oldestPendingMinutes ?? 0) >= env.OPS_ALERT_OLDEST_JOB_MINUTES) alerts.push({ key: "oldest_pending_job_minutes", severity: "warning", value: signals.oldestPendingMinutes!, threshold: env.OPS_ALERT_OLDEST_JOB_MINUTES });
  if (signals.providerFailures15m >= env.OPS_ALERT_PROVIDER_FAILURES_15M) alerts.push({ key: "provider_failures_15m", severity: "warning", value: signals.providerFailures15m, threshold: env.OPS_ALERT_PROVIDER_FAILURES_15M });
  if (signals.failedPrivacyRequests > 0) alerts.push({ key: "failed_privacy_requests", severity: "critical", value: signals.failedPrivacyRequests, threshold: 1 });
  return { status: alerts.some((item) => item.severity === "critical") ? "critical" : alerts.length ? "degraded" : "healthy", alerts } as const;
}

export async function getOperationalSummary(now = new Date()) {
  const jobs = await getDurableJobStats();
  const [providerFailures15m, failedPrivacyRequests, appointmentWebhookPending, appointmentWebhookDeadLetter] = await Promise.all([
    prisma.providerReceipt.count({ where: { createdAt: { gte: new Date(now.getTime() - 15 * 60_000) }, OR: [{ status: { in: ["failed", "error"] } }, { status: "blocked", retryable: true }] } }),
    prisma.dataRightsRequest.count({ where: { status: "failed" } }),
    prisma.durableJob.count({ where: { jobType: { in: ["calcom_webhook", "calcom_reconciliation"] }, status: { in: ["queued", "leased", "retry_scheduled", "reconciliation_required"] } } }),
    prisma.durableJob.count({ where: { jobType: { in: ["calcom_webhook", "calcom_reconciliation"] }, status: "dead_letter" } })
  ]);
  const oldestPendingMinutes = jobs.oldestPendingAt ? Math.max(0, Math.floor((now.getTime() - jobs.oldestPendingAt.getTime()) / 60_000)) : null;
  const signals: OperationalSignals = {
    deadLetterJobs: Number(jobs.counts.dead_letter ?? 0),
    reconciliationJobs: Number(jobs.counts.reconciliation_required ?? 0),
    oldestPendingMinutes,
    providerFailures15m,
    failedPrivacyRequests,
    appointmentWebhookPending,
    appointmentWebhookDeadLetter
  };
  return {
    generatedAt: now.toISOString(),
    release: deploymentInfo,
    flags: { durableJobs: env.DURABLE_JOBS_ENABLED === "true", privateBeta: env.PRIVATE_BETA_ENFORCED === "true", liveTravel: env.LIVE_TRAVEL_ENABLED === "true", privacyRights: env.PRIVACY_RIGHTS_ENABLED === "true", verticalReleaseGating: env.VERTICAL_RELEASE_GATING_ENABLED === "true" },
    signals,
    ...evaluateOperationalSignals(signals)
  };
}
