# Phase 5 Durable Jobs Foundation

Status: **implemented behind a disabled feature flag; local automation is complete and staging acceptance remains pending**

This foundation is intentionally being developed before formal Phase 5 acceptance because Phase 3 live OAuth acceptance requires account-owner interaction. It does not advance the formal phase sequence.

## Canonical ownership

- `DurableJob` is the only background-work queue record.
- Jobs coordinate existing `LifeTransaction`, `ProviderTransactionAttempt`, `ProviderWebhookEvent`, `ProviderIdempotencyRecord`, and `ProviderReceipt` records; job payloads never duplicate those domain lifecycles.
- The web process may enqueue jobs but never processes them.
- The separate worker entry point is `backend-core/src/worker.ts`.

## Implemented controls

- Persistent, versioned jobs with sanitized JSON payloads, priority, schedule, attempt limit, correlation identifiers, leases, heartbeat, completion, and dead-letter evidence.
- Global logical deduplication through `dedupeKey`.
- Compare-and-set claiming that prevents two workers from leasing one job.
- Expired-lease recovery after worker crashes or deployment interruption.
- Central exponential retry delay with jitter and optional provider `retry-after` delay.
- Explicit permanent, retryable, uncertain, and successful outcomes.
- Uncertain actions transition to `reconciliation_required` and enqueue a separate reconciliation job instead of repeating the original action.
- Exhausted or permanent failures enter `dead_letter`.
- Dead-letter retries require a handler-specific safety validator.
- Moderator-only list, statistics, cancel, reschedule, safe retry, and reconcile-now endpoints.
- Operator mutations create `ActivityLog` entries; API responses redact payload contents.
- Worker processing is disabled unless `DURABLE_JOBS_ENABLED=true`.
- Moderator-only Operations UI shows the activation gate, alerts, queue health, redacted jobs, and safe cancel/retry/reconcile controls.
- `npm run drill:phase5` runs the local deterministic failure suite and writes dated JSON and Markdown evidence under `release-evidence/phase-5`.

## Remaining acceptance work

- Register real handlers as provider callbacks, checkout confirmation, connector renewal, notifications, and privacy orchestration are implemented.
- Connect operational alerts to the staging notification/on-call channel.
- Deploy a separate staging worker and apply migration `0020_durable_jobs`.
- Run the complete crash, duplicate, concurrency, rate-limit, timeout, database-reconnect, deployment, stale-event, and dead-letter drills from the execution plan.
- Prove end-to-end correlation across jobs, domain transactions, attempts, webhooks, receipts, and logs.

The flag must remain disabled until those items have dated staging evidence.
