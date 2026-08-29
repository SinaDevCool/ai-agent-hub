# Incident response and rollback

## Triage

1. Record incident commander, start time, environment, release SHA, request IDs, affected capabilities, and user impact.
2. Check `/health/ready` and the moderator-only `/api/admin/operations/summary` endpoint.
3. Treat failed privacy requests and dead-letter jobs as critical. Treat reconciliation backlog, stale jobs, or provider failure bursts as degraded until scoped.
4. Disable the narrowest relevant flag first. Do not retry uncertain external actions until provider state is reconciled.

## Containment and recovery

- Connector incident: disable the affected provider or execution level; preserve OAuth and receipt evidence.
- Transaction incident: stop new transactional levels, reconcile provider state, and never replay without idempotency proof.
- Worker incident: set `DURABLE_JOBS_ENABLED=false`; preserve leased and reconciliation-required jobs.
- Release regression: redeploy the last verified SHA, keep forward database migrations, and use compatibility code rather than destructive schema rollback.
- Data incident: stop affected processing, preserve access logs, involve privacy/security owners, and follow notification obligations approved by counsel.

## Closure evidence

Record timeline, root cause, affected records, recovery checks, user communications, follow-up owners, due dates, and evidence links. A release rollback is complete only after readiness, authentication, critical user journey, queue, and provider-state checks pass.
