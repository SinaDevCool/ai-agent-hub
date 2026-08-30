import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";

type Check = { key: string; label: string; status: "pass" | "warning" | "block"; detail: string };
type Summary = {
  generatedAt: string;
  status: "healthy" | "degraded" | "critical";
  alerts: Array<{ key: string; severity: string; value: number; threshold: number }>;
  flags: { durableJobs: boolean };
  phase5: { status: "ready" | "conditional" | "blocked"; readyForStagingActivation: boolean; checks: Check[] };
};
type Job = {
  id: string; jobType: string; status: string; attemptCount: number; maxAttempts: number;
  scheduledAt: string; leaseExpiresAt?: string | null; lastErrorClassification?: string | null;
  lastErrorMessage?: string | null; correlationId?: string | null;
};
type Stats = { counts: Record<string, number>; oldestPendingAt?: string | null };
type Activation = {
  providerId: string; providerLabel: string; generatedAt: string; status: "ready" | "conditional" | "blocked";
  mode: "live" | "sandbox"; killSwitch: { environmentKey: string; engaged: boolean };
  health: { state: string; message: string; checkedAt: string };
  connections: { total: number; active: number; lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureReason: string | null };
  checks: Check[];
};
type LocalAiReadiness = { status: "ready" | "conditional" | "blocked"; generatedAt: string; flags: Record<string, boolean>; evaluation: { generatedAt?: string; totalCases?: number; metrics?: Record<string, number> } | null; checks: Check[]; rollback: string };

function readable(value: string) { return value.replace(/_/g, " "); }

export function OperationsPanel({ className }: { className?: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [activation, setActivation] = useState<Activation | null>(null);
  const [localAi, setLocalAi] = useState<LocalAiReadiness | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const suffix = status ? `?status=${encodeURIComponent(status)}&limit=50` : "?limit=50";
      const [summaryResult, statsResult, jobsResult, activationResult, localAiResult] = await Promise.all([
        apiGet<Summary>("/api/admin/operations/summary"),
        apiGet<{ stats: Stats }>("/api/admin/durable-jobs/stats"),
        apiGet<{ jobs: Job[] }>(`/api/admin/durable-jobs${suffix}`),
        apiGet<{ activation: Activation }>("/api/admin/operations/activation-readiness/cal-com"),
        apiGet<{ readiness: LocalAiReadiness }>("/api/admin/operations/local-ai-readiness")
      ]);
      setSummary(summaryResult); setStats(statsResult.stats); setJobs(jobsResult.jobs); setActivation(activationResult.activation); setLocalAi(localAiResult.readiness);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Operations data could not be loaded."); }
  }, [status]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(job: Job, action: "cancel" | "retry" | "reconcile") {
    setBusyId(job.id); setError("");
    try { await apiPost(`/api/admin/durable-jobs/${job.id}/${action}`); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed."); }
    finally { setBusyId(""); }
  }

  const queued = Object.entries(stats?.counts ?? {}).filter(([key]) => ["queued", "leased", "retry_scheduled", "reconciliation_required"].includes(key)).reduce((sum, [, value]) => sum + value, 0);
  return <section className={className} aria-label="Operations dashboard">
    <div className="operations-toolbar">
      <div><p className="eyebrow">Phase 5 release gate</p><h2>{summary?.phase5.status ?? "Loading…"}</h2><p>Durable work stays guarded until every blocking check is cleared in staging.</p></div>
      <button className="secondary-button" onClick={() => void refresh()}>Refresh</button>
    </div>
    {error ? <div className="operations-error" role="alert">{error}</div> : null}
    <div className="operations-metrics">
      <article><span>Operations</span><strong>{summary?.status ?? "—"}</strong></article>
      <article><span>Worker flag</span><strong>{summary?.flags.durableJobs ? "Enabled" : "Disabled"}</strong></article>
      <article><span>Active queue</span><strong>{queued}</strong></article>
      <article><span>Dead letters</span><strong>{stats?.counts.dead_letter ?? 0}</strong></article>
    </div>
    <section className="operations-card activation-readiness" aria-label="Cal.com activation readiness">
      <div className="operations-list-heading"><div><p className="eyebrow">Provider activation</p><h3>Cal.com · {activation?.status ?? "Loading…"}</h3></div><span>{activation?.mode ?? "—"} mode</span></div>
      <div className="operations-metrics">
        <article><span>Kill switch</span><strong>{activation?.killSwitch.engaged ? "Engaged" : "Released"}</strong></article>
        <article><span>Provider health</span><strong>{activation?.health.state ?? "—"}</strong></article>
        <article><span>Active connections</span><strong>{activation?.connections.active ?? 0}</strong></article>
        <article><span>Last staging test</span><strong>{activation?.connections.lastSuccessAt ? new Date(activation.connections.lastSuccessAt).toLocaleString() : "Missing"}</strong></article>
      </div>
      <div className="operations-checks">{activation?.checks.map((item) => <article key={item.key} className={`operation-check is-${item.status}`}><span>{item.status}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</div>
    </section>
    <section className="operations-card activation-readiness" aria-label="Local AI activation readiness">
      <div className="operations-list-heading"><div><p className="eyebrow">Local inference activation</p><h3>Desktop AI · {localAi?.status ?? "Loading…"}</h3></div><span>{localAi?.evaluation?.totalCases ?? 0} eval cases</span></div>
      <div className="operations-metrics">
        <article><span>Local AI</span><strong>{localAi?.flags.localAi ? "Enabled" : "Disabled"}</strong></article>
        <article><span>Typed plans</span><strong>{localAi?.flags.planEndpoint ? "Enabled" : "Disabled"}</strong></article>
        <article><span>Cloud fallback</span><strong>{localAi?.flags.cloudFallback ? "Enabled" : "Off"}</strong></article>
        <article><span>Last evaluation</span><strong>{localAi?.evaluation?.generatedAt ? new Date(localAi.evaluation.generatedAt).toLocaleString() : "Missing"}</strong></article>
      </div>
      <div className="operations-checks">{localAi?.checks.map((item) => <article key={item.key} className={`operation-check is-${item.status}`}><span>{item.status}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</div>
      <small>Rollback: {localAi?.rollback ?? "Loading…"}</small>
    </section>
    <div className="operations-grid">
      <section className="operations-card"><h3>Activation checklist</h3>
        <div className="operations-checks">{summary?.phase5.checks.map((check) => <article key={check.key} className={`operation-check is-${check.status}`}><span>{check.status}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></article>)}</div>
      </section>
      <section className="operations-card"><div className="operations-list-heading"><h3>Durable jobs</h3><select aria-label="Filter jobs by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["queued","leased","retry_scheduled","reconciliation_required","dead_letter","succeeded","cancelled"].map((item) => <option key={item} value={item}>{readable(item)}</option>)}</select></div>
        <div className="operations-jobs">{jobs.length ? jobs.map((job) => <article key={job.id} className="operation-job"><div><strong>{readable(job.jobType)}</strong><span>{readable(job.status)} · attempt {job.attemptCount}/{job.maxAttempts}</span>{job.lastErrorMessage ? <small>{job.lastErrorClassification ? `${readable(job.lastErrorClassification)}: ` : ""}{job.lastErrorMessage}</small> : null}</div><div className="operation-actions">{["queued","retry_scheduled"].includes(job.status) ? <button disabled={busyId === job.id} onClick={() => void run(job, "cancel")}>Cancel</button> : null}{job.status === "dead_letter" ? <button disabled={busyId === job.id} onClick={() => void run(job, "retry")}>Retry</button> : null}{["reconciliation_required","dead_letter"].includes(job.status) ? <button disabled={busyId === job.id} onClick={() => void run(job, "reconcile")}>Reconcile</button> : null}</div></article>) : <p className="operations-empty">No jobs match this filter.</p>}</div>
      </section>
    </div>
    {summary?.alerts.length ? <section className="operations-card"><h3>Active alerts</h3>{summary.alerts.map((alert) => <p key={alert.key}><strong>{readable(alert.key)}</strong>: {alert.value} (threshold {alert.threshold})</p>)}</section> : null}
  </section>;
}
