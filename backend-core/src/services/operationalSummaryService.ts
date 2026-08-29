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
  financeSyncPending: number;
  financeSyncDeadLetter: number;
  shoppingHandoffUncertain: number;
};

export function evaluateOperationalSignals(signals: OperationalSignals) {
  const alerts: Array<{ key: string; severity: "warning" | "critical"; value: number; threshold: number }> = [];
  if (signals.deadLetterJobs >= env.OPS_ALERT_DEAD_LETTER_WARN) alerts.push({ key: "dead_letter_jobs", severity: "critical", value: signals.deadLetterJobs, threshold: env.OPS_ALERT_DEAD_LETTER_WARN });
  if (signals.reconciliationJobs >= env.OPS_ALERT_RECONCILIATION_WARN) alerts.push({ key: "reconciliation_jobs", severity: "warning", value: signals.reconciliationJobs, threshold: env.OPS_ALERT_RECONCILIATION_WARN });
  if ((signals.oldestPendingMinutes ?? 0) >= env.OPS_ALERT_OLDEST_JOB_MINUTES) alerts.push({ key: "oldest_pending_job_minutes", severity: "warning", value: signals.oldestPendingMinutes!, threshold: env.OPS_ALERT_OLDEST_JOB_MINUTES });
  if (signals.providerFailures15m >= env.OPS_ALERT_PROVIDER_FAILURES_15M) alerts.push({ key: "provider_failures_15m", severity: "warning", value: signals.providerFailures15m, threshold: env.OPS_ALERT_PROVIDER_FAILURES_15M });
  if (signals.failedPrivacyRequests > 0) alerts.push({ key: "failed_privacy_requests", severity: "critical", value: signals.failedPrivacyRequests, threshold: 1 });
  if (signals.shoppingHandoffUncertain > 0) alerts.push({ key: "shopping_handoff_uncertain", severity: "warning", value: signals.shoppingHandoffUncertain, threshold: 1 });
  return { status: alerts.some((item) => item.severity === "critical") ? "critical" : alerts.length ? "degraded" : "healthy", alerts } as const;
}

export type ActivationCheck = {
  key: string;
  label: string;
  status: "pass" | "warning" | "block";
  detail: string;
};

export function phase5ActivationChecklist(input: {
  environment: string;
  migrationVersion: string;
  durableJobsEnabled: boolean;
  operationalStatus: "healthy" | "degraded" | "critical";
  signals: OperationalSignals;
}) {
  const migrationNumber = Number(input.migrationVersion.match(/\d+/)?.[0] ?? 0);
  const checks: ActivationCheck[] = [
    {
      key: "feature_guard",
      label: "Worker feature guard",
      status: input.durableJobsEnabled ? "warning" : "pass",
      detail: input.durableJobsEnabled
        ? "Durable jobs are enabled. Confirm staging drills before leaving the worker active."
        : "Durable jobs remain disabled until the failure drills are evidenced."
    },
    {
      key: "migration",
      label: "Durable-job migration",
      status: migrationNumber >= 20 ? "pass" : "block",
      detail: migrationNumber >= 20
        ? `Migration ${input.migrationVersion} includes the durable-job store.`
        : `Apply migration 0020_durable_jobs in staging; reported version is ${input.migrationVersion}.`
    },
    {
      key: "queue_health",
      label: "Queue health",
      status: input.operationalStatus === "healthy" ? "pass" : input.operationalStatus === "degraded" ? "warning" : "block",
      detail: input.operationalStatus === "healthy"
        ? "No queue or recovery alert is active."
        : `${input.operationalStatus} operational signals must be resolved before activation.`
    },
    {
      key: "dead_letters",
      label: "Dead-letter backlog",
      status: input.signals.deadLetterJobs === 0 ? "pass" : "block",
      detail: input.signals.deadLetterJobs === 0
        ? "No dead-letter jobs are waiting."
        : `${input.signals.deadLetterJobs} dead-letter job(s) require operator review.`
    },
    {
      key: "staging_environment",
      label: "Staging deployment",
      status: input.environment === "staging" ? "pass" : "warning",
      detail: input.environment === "staging"
        ? "This report is running in staging."
        : `Current environment is ${input.environment}; local evidence does not replace staging acceptance.`
    },
    {
      key: "failure_drills",
      label: "Failure-drill evidence",
      status: "block",
      detail: "Run the Phase 5 drill runner against the deployed staging database and attach its dated evidence report."
    },
    {
      key: "on_call",
      label: "Operator and alert sign-off",
      status: "block",
      detail: "A named operator must validate alerts, dead-letter recovery, and escalation ownership in staging."
    }
  ];
  return {
    status: checks.some((check) => check.status === "block") ? "blocked" : checks.some((check) => check.status === "warning") ? "conditional" : "ready",
    readyForStagingActivation: checks.every((check) => check.status !== "block"),
    checks
  } as const;
}

export async function getOperationalSummary(now = new Date()) {
  const jobs = await getDurableJobStats();
  const [providerFailures15m, failedPrivacyRequests, appointmentWebhookPending, appointmentWebhookDeadLetter, financeSyncPending, financeSyncDeadLetter, shoppingHandoffUncertain] = await Promise.all([
    prisma.providerReceipt.count({ where: { createdAt: { gte: new Date(now.getTime() - 15 * 60_000) }, OR: [{ status: { in: ["failed", "error"] } }, { status: "blocked", retryable: true }] } }),
    prisma.dataRightsRequest.count({ where: { status: "failed" } }),
    prisma.durableJob.count({ where: { jobType: { in: ["calcom_webhook", "calcom_reconciliation"] }, status: { in: ["queued", "leased", "retry_scheduled", "reconciliation_required"] } } }),
    prisma.durableJob.count({ where: { jobType: { in: ["calcom_webhook", "calcom_reconciliation"] }, status: "dead_letter" } }),
    prisma.durableJob.count({ where: { jobType: { in: ["plaid_webhook", "plaid_reconciliation"] }, status: { in: ["queued", "leased", "retry_scheduled", "reconciliation_required"] } } }),
    prisma.durableJob.count({ where: { jobType: { in: ["plaid_webhook", "plaid_reconciliation"] }, status: "dead_letter" } }),
    prisma.lifeTransaction.count({ where: { providerId: "instacart", state: { in: ["uncertain", "reconciliation_required"] } } })
  ]);
  const oldestPendingMinutes = jobs.oldestPendingAt ? Math.max(0, Math.floor((now.getTime() - jobs.oldestPendingAt.getTime()) / 60_000)) : null;
  const signals: OperationalSignals = {
    deadLetterJobs: Number(jobs.counts.dead_letter ?? 0),
    reconciliationJobs: Number(jobs.counts.reconciliation_required ?? 0),
    oldestPendingMinutes,
    providerFailures15m,
    failedPrivacyRequests,
    appointmentWebhookPending,
    appointmentWebhookDeadLetter,
    financeSyncPending,
    financeSyncDeadLetter,
    shoppingHandoffUncertain
  };
  const operational = evaluateOperationalSignals(signals);
  const durableJobsEnabled = env.DURABLE_JOBS_ENABLED === "true";
  return {
    generatedAt: now.toISOString(),
    release: deploymentInfo,
    flags: { durableJobs: durableJobsEnabled, privateBeta: env.PRIVATE_BETA_ENFORCED === "true", liveTravel: env.LIVE_TRAVEL_ENABLED === "true", liveFinance: env.LIVE_FINANCE_ENABLED === "true", liveShopping: env.LIVE_SHOPPING_ENABLED === "true", liveHousehold: env.LIVE_HOUSEHOLD_ENABLED === "true", liveLeisure: env.LIVE_LEISURE_ENABLED === "true", liveSmartHomeRead: env.LIVE_SMART_HOME_READ_ENABLED === "true", liveSmartHomeControl: env.LIVE_SMART_HOME_CONTROL_ENABLED === "true", liveWellness: env.LIVE_WELLNESS_ENABLED === "true", privacyRights: env.PRIVACY_RIGHTS_ENABLED === "true", verticalReleaseGating: env.VERTICAL_RELEASE_GATING_ENABLED === "true" },
    signals,
    ...operational,
    phase5: phase5ActivationChecklist({
      environment: deploymentInfo.environment,
      migrationVersion: deploymentInfo.migrationVersion,
      durableJobsEnabled,
      operationalStatus: operational.status,
      signals
    })
  };
}
