# Release, Beta, and Provider Rollout

This is the authoritative operational completion checklist for AI Agent Hub. A phase is complete only when its exit criteria are evidenced; having code in the repository is not the same as having a live provider or production deployment. Canonical ownership and the mandatory reuse gate are defined in [`architecture-decisions.md`](architecture-decisions.md); do not create parallel approval, transaction, provider, receipt, or job systems.

The detailed feature execution plan is [`phases-3-8-execution-plan.md`](phases-3-8-execution-plan.md). That companion follows the product phase numbering requested for connectors, travel, durable jobs, private beta, production, and additional verticals. This document remains the authoritative operational gate checklist; the companion is authoritative for implementation sequence, reuse decisions, and workstream scope.

## Phase 1 — Continuous verification

The GitHub Actions workflow verifies type safety, lint, unit/integration tests, both builds, database bootstrap/seed, the consumer Playwright smoke, and PostgreSQL migrations/tests. Protect `master` and require the `verify`, `browser-smoke`, and `postgres-integration` jobs before merge.

Exit criteria:

- All CI jobs pass on the release commit.
- The PostgreSQL Prisma client generates successfully.
- No uncommitted migration or generated-schema drift remains.

## Phase 2 — Staging infrastructure

Use separate deployment resources for staging and production. `render.yaml` documents the Express API and an optional Render-hosted static frontend; the current production frontend is Cloudflare Pages. Supply every secret in the relevant hosting dashboard and never commit it.

Frontend variables:

- `VITE_API_BASE_URL=https://<api>.onrender.com`
- `VITE_WS_URL=wss://<api>.onrender.com/ws`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Backend variables are listed in the root README. Set `FRONTEND_ORIGIN` and `FRONTEND_PUBLIC_URL` to the frontend origin and `API_PUBLIC_URL` to the API origin. `APP_PUBLIC_URL` is a deprecated compatibility input and must not be used to conflate frontend and backend URLs. Use a staging Supabase project and database that contain no production user data.

Exit criteria:

- Blueprint sync succeeds and PostgreSQL migrations finish.
- `BACKEND_BASE_URL=... FRONTEND_BASE_URL=... npm run verify:release` passes.
- Sign-up/sign-in, install, first prompt, approval, transaction history, and logout pass manually with a staging account.

## Phase 3 — Security and operations

- Rotate and store encryption, Supabase, OpenAI, OAuth, provider, and notification credentials only in the hosting secret store.
- Restrict Supabase redirect URLs to staging/production origins and enable the desired email verification policy.
- Configure provider webhook signing secrets and reject unsigned or replayed events before enabling live writes.
- Configure error monitoring and uptime checks for `/health` and `/health/ready`.
- Keep the API auth smoke in every post-deploy check; production must reject `x-user-id` spoofing.
- Document incident owner, rollback commit, database restore procedure, and provider disable switch.

Exit criteria:

- Secret inventory has an owner and rotation date.
- Restore and rollback drills succeed in staging.
- Alerts reach the on-call owner.
- A failed provider health check disables transactions without disabling read-only discovery.

## Phase 4 — Closed beta instrumentation

Use privacy-minimized product events or the existing activity log to measure the funnel without recording prompt bodies, medical details, payment data, or provider credentials:

1. account authenticated;
2. helper profile viewed;
3. helper installed;
4. connector/provider connection completed;
5. first agent run started and completed;
6. approval requested and resolved;
7. provider action confirmed, failed, or required reconciliation.

Track completion rate, time to first useful result, approval abandonment, provider failure rate, reconciliation age, and seven-day retained users. Start with internal users, then 10–25 invited users.

Exit criteria:

- Each funnel event can be queried by release version and environment.
- No sensitive payload is present in analytics.
- Support can correlate a user-reported failure with request ID, run ID, tool run, provider receipt, and transaction attempt.

## Phase 5 — Live travel pilot

Start with one region and one provider. Recommended order:

1. live flight/hotel search;
2. redirect or prepared checkout;
3. approval-gated booking for a small allowlist;
4. cancellation and reconciliation;
5. wider beta.

Before `transact` is enabled, complete the provider commercial agreement, production credentials, passenger-data policy, price-change handling, terms/refund presentation, idempotency tests, webhook verification, uncertain-state reconciliation, and a real cancellation test. Booking.com consumer-page automation is not a supported integration strategy; use an authorized partner API or redirect flow.

Exit criteria:

- Contract tests pass against provider certification/sandbox.
- A duplicate request cannot create two bookings.
- Timeout-after-submit becomes `uncertain` and is reconciled by external reference instead of retried blindly.
- The user sees final price, supplier, cancellation terms, and an explicit confirmation before purchase.

## Phase 6 — Additional life verticals

Promote one vertical at a time. The implementation already has sandbox flows for appointments, finance, shopping, household, leisure, smart home, and wellness. A vertical is live only after its provider-specific acceptance checklist is complete.

For every vertical require: authorized API access, regional/legal review, data minimization, explicit scopes, provider health check, idempotency for writes, human approval, receipt/audit trail, cancellation or reversal where supported, reconciliation, support runbook, and kill switch.

Finance remains read-only until regulated payment initiation and consent requirements are satisfied. Wellness must remain non-diagnostic unless a separately reviewed medical product and licensed workflow are introduced.

## Phase 7 — General availability

- Publish privacy policy, terms, provider disclosures, deletion/export flow, support contact, and service-status page.
- Complete load, abuse, dependency, accessibility, and mobile usability tests.
- Establish SLOs for availability, agent-run latency, provider success, and reconciliation time.
- Use feature flags/allowlists for every transactional provider and preserve the sandbox fallback.

Exit criteria:

- All launch documents and data-subject workflows are tested.
- Production dashboards and alerts cover the SLOs.
- The release verifier and critical user journey pass after deployment.
- No vertical is marketed as live while it still uses deterministic sandbox data.
