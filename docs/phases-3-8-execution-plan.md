# Phases 3–8 Execution Plan and Repository Audit

Status: planning baseline. This document uses the requested phase numbering and is the detailed execution companion to [`release-and-rollout.md`](release-and-rollout.md). It does not declare a provider live or a release complete; every milestone requires the listed evidence.

## 1. Executive decision

The repository is not starting these phases from zero. It already contains the core platform architecture needed for all six phases. Work should proceed by hardening and extending the existing systems, not by introducing new connector, approval, transaction, provider, receipt, marketplace, or analytics stacks.

Recommended sequence:

1. Finish Phase 3 connector hardening and live staging acceptance.
2. Build the Phase 5 durable-job foundation before enabling any Phase 4 transactional travel capability.
3. Launch travel as search, then hosted checkout, while keeping native booking disabled.
4. Add private-beta access and support operations around the existing onboarding and marketplace.
5. Complete the production gates, including the previously deferred security work.
6. Promote one existing sandbox vertical at a time through the same provider lifecycle.

Phase 4 search work can run alongside the early Phase 5 job work. Hosted checkout must not launch until callback processing, retry policy, reconciliation, and dead-letter operations are proven. Phase 7 is blocked by every unresolved security and operational gate, regardless of feature completeness.

## 2. Repository audit

### 2.1 Current application map

| Area | Existing canonical implementation | Decision |
| --- | --- | --- |
| Identity | Supabase Auth and `User` | Extend; do not add app-local auth |
| Google/Microsoft identities | `ConnectedAccount`, connector routes, `connectorAccountService` | Extend |
| Google APIs | `googleConnectorService` | Harden and expand |
| Microsoft Graph | `microsoftConnectorService` | Harden and expand |
| Connector tool execution | `agentConnectorToolRuntimeService`, Google adapter, tool registry | Extend |
| Human approval | `HitlRequest` and HITL routes/services | Reuse for every consequential action |
| Provider credentials | encrypted `ProviderConnection` | Reuse |
| Provider catalog/readiness | `ProviderDefinition`, `lifePlatformCatalog`, readiness service | Reuse |
| Provider runtime | provider contracts, runtime adapter service, provider health | Extend with provider-specific adapters |
| User action lifecycle | `LifeTransaction` | Reuse as the only real-world action state machine |
| Delivery evidence | `ProviderTransactionAttempt`, `ProviderReceipt` | Reuse |
| Idempotency/webhooks | `ProviderIdempotencyRecord`, `ProviderWebhookEvent`, delivery service | Extend |
| Marketplace/onboarding | agent definitions, versions, installs, frontend onboarding | Extend |
| Audit/analytics | `ActivityLog`, `AgentTrace`, run/tool/transaction records | Extend before considering a new event store |
| User notifications | `Notification` and authenticated realtime hub | Reuse |
| Vertical demos | travel, appointments, finance, shopping, household, leisure, smart-home, wellness sandbox services | Promote; do not rebuild |

Application entry points are `backend-core/src/server.ts` and `backend-core/src/app.ts` for the Express API, and the Vite/React frontend workspace. The root commands remain the supported development and verification interface:

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke:ui`
- `BACKEND_BASE_URL=... FRONTEND_BASE_URL=... npm run verify:release`

### 2.2 Already implemented by requested phase

#### Phase 3 foundations

- Google and Microsoft OAuth start/callback routes.
- Encrypted access and refresh token storage in `ConnectedAccount`.
- Refresh-token handling and disconnect state.
- Gmail/Outlook search, draft, and draft-send operations.
- Google/Microsoft calendar free-time and event creation.
- Drive/OneDrive file search.
- Shared tool routing and existing approval infrastructure.
- Connector discovery/readiness and frontend connection management.

#### Phase 4 foundations

- Amadeus search adapter and Duffel flight adapter.
- Travel sandbox search, quote, booking, cancellation, calendar, and itinerary flows.
- Generic provider contracts, definitions, readiness, health, connection, receipts, and runtime adapters.
- Transaction states for uncertain actions and reconciliation.
- Idempotency and provider-attempt records.

#### Phase 5 foundations

- Durable database records for provider attempts, webhook events, idempotency, transactions, receipts, agent runs, and tool runs.
- Request IDs, activity records, health endpoints, rate limiting, and release verification.
- Missing: a leased job runner, scheduling, retry orchestration, dead-letter operations, and reconciliation workers.

#### Phase 6 foundations

- Authentication, marketplace discovery, installs, agent execution, connector setup, onboarding UI, activity history, and receipts.
- Creator/moderation roles and flows.
- Missing: invite lifecycle, beta cohorts, integrated feedback/support intake, beta dashboards, and operational playbooks.

#### Phase 7 foundations

- CI for typecheck, lint, tests, builds, browser smoke, and PostgreSQL integration.
- Staging release verification and rollback evidence.
- Pino logging, request IDs, health/readiness endpoints, provider disable controls, and distributed rate limiting.
- Missing or incomplete: production observability, alert routing, backup-restore evidence, security automation, accessibility/performance gates, privacy workflows, status/incident operations, and production launch evidence.

#### Phase 8 foundations

- Sandbox services and data models already cover every requested vertical.
- Provider catalog entries already identify many candidate providers.
- The reusable provider lifecycle is present, so each vertical primarily needs an authorized adapter, acceptance suite, policy review, and operating runbook.

### 2.3 Duplication and redundancy controls

The rules in [`architecture-decisions.md`](architecture-decisions.md) are mandatory. In addition:

1. Do not add `GoogleAccount`, `MicrosoftAccount`, or provider-specific token tables. Extend `ConnectedAccount` with provider-neutral fields and keep provider details in sanitized metadata only when necessary.
2. Do not add a connector-specific approval table or modal state machine. Connector tools create and resolve `HitlRequest` records.
3. Do not let travel adapters own booking state. They translate provider contracts; `LifeTransaction` remains authoritative.
4. Do not add provider-specific receipt or retry tables. Use `ProviderReceipt`, `ProviderTransactionAttempt`, `ProviderIdempotencyRecord`, and the proposed shared durable job table.
5. Do not make frontend code infer provider safety or live status. It consumes backend readiness and capability decisions.
6. Do not create a second marketplace or onboarding flow for beta. Add access gates and cohort state around the existing flow.
7. Do not create a separate analytics pipeline until queries prove `ActivityLog`, `AgentTrace`, runs, approvals, and transactions cannot provide a required privacy-safe metric.
8. Do not copy sandbox business logic into live adapters. Keep normalized contracts and swap the runtime provider.
9. Do not call deterministic sandbox results “live.” Every UI result must carry environment, provider, freshness, and capability provenance.

## 3. Cross-phase architecture work

Complete these before or during the first Phase 3 milestone:

### 3.1 Capability and release controls

- Add server-owned feature flags for each provider capability: `discover`, `read`, `prepare`, `redirect`, `transact`, `cancel`, and `reconcile`.
- Support environment, cohort, user allowlist, region, and provider-health conditions.
- Store the evaluated capability on each transaction/attempt for later audit.
- Default every new live write capability to disabled.

### 3.2 Common provider contract

- Standardize request envelope: request ID, user ID, transaction ID, idempotency key, locale, currency, region, and consent/approval evidence.
- Standardize result envelope: provider, external reference, status, price, currency, expiry, terms URL, timestamps, raw-response checksum, and sanitized diagnostic data.
- Version normalized offers so stale provider responses cannot be mistaken for current prices.
- Require provider adapters to classify failures as validation, authentication, rate-limit, retriable, permanent, or uncertain.

### 3.3 Privacy and retention

- Define field-level data classification for connector tokens, email metadata, calendar data, Drive metadata, passenger details, payment redirects, health/wellness data, and support records.
- Record retention periods and deletion behavior for every canonical model.
- Keep prompts, message bodies, access tokens, medical details, and payment data out of analytics and logs.
- Add a single user export/deletion coordinator that calls canonical domain services instead of directly deleting tables ad hoc.

## 4. Phase 3 — Google and Microsoft connectors

### Outcome

A user can safely connect one or more Google or Microsoft accounts, use least-privilege email/calendar/file tools, refresh and revoke access, and approve every external write immediately before execution.

### Workstream 3A: OAuth security and account lifecycle

- Replace reusable signed-state-only authorization with one-time OAuth transactions. Persist a hashed state/nonce with provider, user, return path, expiry, and consumed timestamp.
- Add PKCE where supported and enforce exact redirect URI, issuer, tenant, and audience checks.
- Split scopes by capability and request incremental consent. Suggested bundles: identity; email read; email draft/send; calendar read; calendar write; file metadata/read.
- Show requested scopes and plain-language purpose before redirect.
- Preserve multiple labeled accounts without relaxing the existing user/provider/account uniqueness rules.
- Add refresh locking so concurrent requests do not race token rotation. Persist refresh status, last success, next retry, and sanitized failure reason.
- Handle revoked grants and `invalid_grant` by marking reconnection required and notifying the user once.
- On disconnect, call Google token revocation or Microsoft permission/session revocation where the APIs allow it, then clear local encrypted tokens. Record the result in `ActivityLog`.
- Add account reauthorization without creating a second account record.

### Workstream 3B: API completeness

- Email: paginated search, normalized sender/recipient/thread metadata, draft create/update/delete, and send-draft.
- Calendar: calendar selection, free/busy, event create/update/delete, timezone validation, attendee preview, and conflict warning.
- Files: paginated metadata search, safe file selection, MIME/size metadata, and explicit download/content-read scopes only when a feature needs them.
- Add bounded pagination, provider timeouts, rate-limit handling, and sanitized error mapping.
- Add Google history/watch and Microsoft delta/subscription support only after durable jobs exist; use jobs for subscription renewal and missed-event reconciliation.

### Workstream 3C: approval boundary

- Reads may run under granted permission; drafts remain reversible.
- Sending email, inviting attendees, creating/updating/deleting events, sharing files, and any irreversible file mutation require `HitlRequest`.
- Approval payload must display account, recipients/attendees, subject/title, time/timezone, location, attachments, and exact action.
- Bind approval to a hash of the final normalized arguments. Any edit invalidates approval.
- Resume through the existing approved-tool execution path and existing `ToolRun` idempotency key.
- Add duplicate-click and concurrent-resume tests proving a single external write.

### Workstream 3D: product UX

- Extend the existing connector setup page with provider readiness, scopes, account label, token health, last refresh, and reconnect/disconnect actions.
- Explain whether an operation reads, drafts, or sends.
- Provide a review screen before approval and a receipt/activity link after execution.
- Handle popup blocked, state expired, consent denied, tenant restriction, revoked token, and partial-scope cases.

### Workstream 3E: tests and acceptance

- Unit tests for both providers covering refresh rotation, missing refresh token, invalid grant, pagination, rate limiting, and normalized errors.
- OAuth state replay, expiry, wrong user/provider, and redirect tampering tests.
- Tenant-isolation tests for every account lookup.
- Contract tests using recorded sanitized provider fixtures.
- Staging acceptance with one test Google Workspace account and one Microsoft 365 account.
- Evidence: connect, reconnect, refresh, revoke, email search, draft, approved send, free/busy, approved event create, file search, denied approval, and duplicate-resume prevention.

### Exit criteria

- Provider-side and local revocation behavior is documented and tested.
- No write occurs without an argument-bound approval.
- Refresh races cannot corrupt or lose the newest refresh token.
- Logs and analytics contain no token or message-body leakage.
- Both providers pass the same normalized capability contract.

## 5. Phase 4 — Live travel

### Outcome

Users receive real, attributable flight/hotel offers and can proceed to an authorized hosted checkout. Native booking remains disabled until commercial, compliance, support, and reconciliation prerequisites are satisfied.

### Workstream 4A: provider and market selection

- Select one launch region, currency set, flight provider, and hotel provider through a written provider decision record.
- Verify commercial/API access, certification environment, rate limits, permitted caching, attribution, deep-link/checkout support, data residency, support escalation, and refund/cancellation obligations.
- Use existing Amadeus/Duffel adapters only where their contracted capabilities match. Do not infer production entitlement from sandbox credentials.

### Workstream 4B: live search

- Implement provider-specific normalization into versioned flight and hotel offer contracts.
- Include supplier, itinerary/property, fare/room rules, baggage/occupancy, taxes/fees, currency, offer expiry, source provider, and fetched-at timestamp.
- Add search validation, bounded passenger/room counts, region/currency constraints, timeout budgets, and partial-result handling.
- Add short-lived cache only where provider terms permit; cache keys must include all price-affecting inputs.
- Clearly label live, sandbox, stale, and unavailable results.
- Record search latency/success without storing passenger names or sensitive query payloads.

### Workstream 4C: repricing and hosted checkout

- Revalidate the selected offer immediately before checkout.
- Present price changes and require the user to accept the new amount.
- Create a `LifeTransaction` in a prepared state and a provider attempt before redirect generation.
- Generate only authorized provider checkout/deep links, with allowlisted hosts and short expiries.
- Preserve transaction and correlation identifiers through the return/callback flow.
- Treat redirect return as user navigation, not proof of purchase. Confirm through provider API/webhook or reconciliation.

### Workstream 4D: callbacks and support

- Add provider-specific webhook verification, timestamp tolerance, replay protection, raw-body handling, and event deduplication through `ProviderWebhookEvent`.
- Reconcile callback data to `LifeTransaction` and `ProviderTransactionAttempt`; create a canonical receipt on confirmation.
- Provide user-visible pending/confirmed/failed/reconciliation-required states.
- Add a support view keyed by request, run, transaction, attempt, external reference, webhook, and receipt IDs.
- Document supplier handoff, cancellation ownership, refund expectations, and escalation contacts.

### Native booking gate — later only

Native booking may be enabled only when all of these are evidenced:

- Executed provider agreement and approved production use case.
- Passenger-data, payment, sanctions/fraud, regional consumer-law, and privacy review.
- Final-price and terms approval bound to exact booking arguments.
- Idempotency and timeout-after-submit tests.
- Webhook and polling reconciliation.
- Real cancellation/refund/support exercise.
- 24/7 or contractually adequate incident and customer support.
- Per-provider kill switch and small allowlisted cohort.

### Exit criteria

- Search results are real, traceable, fresh, and never mixed with sandbox offers.
- Hosted checkout return is reconciled independently.
- Duplicate requests cannot create duplicate external actions.
- An uncertain outcome is never blindly retried.
- Native booking remains disabled until its separate gate is approved.

## 6. Phase 5 — Durable jobs

### Outcome

Callbacks, retries, reconciliation, maintenance, and recovery survive process restarts and produce an auditable, operator-recoverable history.

### Architecture decision

Use PostgreSQL as the initial durable job store because the application already depends on PostgreSQL/Supabase and currently lacks a separate worker-compatible queue dependency. Add one canonical `DurableJob` model and one worker service. Do not duplicate transaction or attempt state inside the job payload.

The model should contain: ID, job type/version, owner user where applicable, aggregate type/ID, dedupe key, sanitized payload, status, priority, scheduled time, attempt count/max attempts, lease owner/expiry, heartbeat, last error classification/message, created/started/completed timestamps, and dead-letter timestamp. Add unique constraints for active dedupe and indexes for claim order and expired leases.

### Workstream 5A: worker runtime

- Add atomic claim using PostgreSQL row locking/leases and bounded batches.
- Run a separate worker process in staging/production; the web process only enqueues.
- Heartbeat long jobs and safely reclaim expired leases.
- Version job payloads and validate with schemas.
- Propagate request/transaction/run IDs into structured logs.
- Support graceful shutdown without losing claimed work.

### Workstream 5B: retry policy

- Centralize retry classification and exponential backoff with jitter.
- Retry only explicitly safe reads and idempotent writes.
- Honor provider retry-after headers and rate limits.
- On timeout after a write may have reached a provider, mark the transaction uncertain and enqueue reconciliation—not the original write.
- Cap attempts and move exhausted jobs to dead-letter status with an operator-visible reason.

### Workstream 5C: reconciliation

- Implement provider status polling by external reference and time-window searches where supported.
- Reconcile webhooks, provider status, attempts, transaction state, and receipts in one service.
- Define terminal, retryable, uncertain, and manual-review outcomes.
- Schedule increasing reconciliation intervals and an age-based escalation SLA.
- Never overwrite a newer terminal state with a late stale callback.

### Workstream 5D: operator controls

- Add authenticated admin endpoints/UI to filter queued, leased, failed, uncertain, and dead-letter jobs.
- Permit retry only through a type-specific safety validator.
- Support cancel, reschedule, reconcile-now, and acknowledge operations with `ActivityLog` audit entries.
- Redact payloads by default and expose correlation IDs rather than secrets or sensitive content.
- Add queue depth, oldest age, failure rate, lease expiry, reconciliation age, and dead-letter alerts.

### Initial job types

1. provider webhook processing;
2. provider status reconciliation;
3. checkout confirmation polling;
4. connector subscription renewal and delta catch-up;
5. token refresh recovery where safe;
6. notification delivery;
7. export/deletion orchestration;
8. periodic provider health checks.

### Tests and failure drills

- Process crash after external submit but before local commit.
- Process crash after local commit but before acknowledgement.
- Duplicate enqueue, duplicate webhook, concurrent workers, expired lease, and out-of-order event.
- Provider 429/5xx/timeout/invalid response/permanent rejection.
- Database reconnect and deployment during active jobs.
- Dead-letter replay with changed provider state.
- Property test: one logical idempotency key produces at most one provider mutation.

### Exit criteria

- Jobs survive web and worker restarts.
- Two workers cannot execute one leased job concurrently.
- Uncertain writes reconcile without blind resubmission.
- Dead letters are visible, alerting, documented, and safely operable.
- Every provider action can be traced end-to-end.

## 7. Phase 6 — Private beta

### Outcome

An invite-only cohort can discover agents, connect providers, complete useful tasks, report problems, and receive support while the team measures safety and value.

### Workstream 6A: access and cohorts

- Add one canonical `BetaInvite`/access model with hashed token, email, cohort, inviter, expiry, redemption, status, and optional user ID.
- Enforce beta access server-side after authentication; the UI is not the security boundary.
- Support single-use invites, revoke, resend/replace, cohort limits, and audit history.
- Add user/cohort capability allowlists through the common feature-flag service.

### Workstream 6B: onboarding

- Extend the existing onboarding instead of adding a beta-specific wizard.
- Sequence: authenticate, accept beta terms, choose goals, discover/install an agent, connect an optional provider, run a safe first task, understand approvals/history, and locate support.
- Allow skip/resume and show setup progress from backend state.
- Keep transactional capabilities disabled by default.

### Workstream 6C: discovery and trust

- Show agent publisher, version, permissions, connected providers, data used, approval behavior, sandbox/live status, and last updated date.
- Add curated beta collections and compatibility/readiness filters to the existing marketplace.
- Make uninstall/revoke/export/delete easy to find.

### Workstream 6D: feedback and support

- Add a privacy-safe feedback path attached to optional request/run/transaction IDs.
- Use an external support system or one small canonical feedback record; do not build a second chat platform.
- Collect category, severity, expected/actual result, consented diagnostics, and contact preference.
- Create triage SLAs for access, connector, provider, privacy/security, and transaction issues.
- Prepare macros/runbooks for reconnect, failed approval, uncertain action, refund/cancellation handoff, and deletion.

### Workstream 6E: beta metrics

Derive events from canonical records and extend `ActivityLog` only where necessary:

- invite sent/redeemed and activation rate;
- onboarding completion and time to first useful result;
- agent viewed/installed/first successful run;
- connector start/completion/reconnect/revoke;
- approval request/approve/deny/expire and abandonment;
- provider success/failure/uncertain/reconciliation time;
- seven-day retained users, support contact rate, and critical incident count.

Every metric must be filterable by release, environment, provider, capability, and cohort without logging prompt bodies or sensitive provider payloads.

### Rollout stages

1. Team-only dogfood.
2. Five trusted external users.
3. Ten to twenty-five invited users.
4. Fifty to one hundred users only after connector and support targets hold.

Pause expansion on any cross-tenant exposure, unauthorized write, duplicate transaction, unreconciled action beyond SLA, severe privacy issue, or support capacity breach.

### Exit criteria

- Invite enforcement cannot be bypassed through the API.
- The critical funnel and safety metrics are queryable.
- Support can correlate a report end-to-end without viewing secrets.
- Cohort expansion and pause criteria have named owners.
- Beta users can revoke connectors and delete/export their data.

## 8. Phase 7 — Production release

### Outcome

The system is publicly releasable only after security, reliability, privacy, accessibility, performance, legal, support, and incident-response evidence is complete.

### Gate 7A: security

- Complete the deferred security phase before production.
- Threat-model auth, OAuth, tenant isolation, approvals, provider callbacks, SSRF, prompt/tool injection, admin roles, file access, and transaction replay.
- Add secret scanning, dependency review, SAST, container/build provenance where applicable, and scheduled patching.
- Test IDOR/tenant isolation across every user-owned model and admin route.
- Rotate all staging-derived credentials and verify production-only secret ownership.
- Add security contact, vulnerability intake, severity model, and response SLA.

### Gate 7B: backup and recovery

- Define PostgreSQL RPO/RTO, automated backup/PITR configuration, ownership, retention, and restore credentials.
- Restore a production-shaped backup into an isolated environment and run integrity checks.
- Test migration rollback/forward-fix, frontend rollback, API rollback, worker rollback, and provider kill switches.
- Back up required configuration/definitions without exporting encrypted secrets into documents.

### Gate 7C: accessibility and usability

- Target WCAG 2.2 AA for authentication, onboarding, marketplace, connector consent, approvals, transaction status, and support.
- Add automated axe checks plus keyboard, screen reader, focus, contrast, zoom, reduced-motion, error association, and mobile tests.
- Ensure approval details and live/sandbox status are not color-only.

### Gate 7D: performance and capacity

- Set budgets for frontend LCP/INP/CLS, API latency, agent-run latency, provider latency, queue age, and database connections.
- Load-test auth-protected reads, agent runs, connector refresh bursts, webhook ingestion, job claims, and provider callback storms.
- Validate rate-limit behavior, backpressure, autoscaling/cold starts, and provider quota exhaustion.
- Add database query/index review using production-shaped data.

### Gate 7E: privacy, legal, and data rights

- Publish privacy policy, terms, provider disclosures, subprocessor list, retention schedule, and support contact.
- Test access/export, correction where applicable, deletion, consent withdrawal, and connector revocation.
- Complete DPIA/legitimate-basis and regional review where required, especially travel, finance, wellness, and email/calendar data.
- Confirm cookie/analytics behavior and consent requirements.

### Gate 7F: observability and incident response

- Add centralized error monitoring and metrics with release/environment tags.
- Define SLOs and alerts for availability, auth, agent success, connector health, provider success, queue age, reconciliation age, and webhook failures.
- Create dashboards linking request, user-safe correlation, run, tool, approval, transaction, attempt, job, webhook, and receipt IDs.
- Establish on-call ownership, escalation, incident roles, status page, communication templates, and postmortem process.
- Drill auth outage, provider outage, duplicate-action near miss, webhook backlog, database degradation, secret exposure, and bad deployment.

### Gate 7G: release engineering

- Protect the production branch and require all CI checks and reviews.
- Add migration checks, security scans, accessibility smoke, and performance budgets to CI.
- Make deployments immutable and expose release identity in health and UI diagnostics.
- Use staged rollout, canary cohort, rollback thresholds, and post-deploy critical-journey verification.
- Ensure `render.yaml` and actual hosting configuration do not drift; document all frontend, API, worker, database, Redis, OAuth, provider, and monitoring resources.

### Exit criteria

- Every gate has dated evidence, owner, approver, and rollback path.
- Restore and incident drills meet RPO/RTO and communication targets.
- Critical journeys pass after production deployment.
- Dashboards and alerts cover agreed SLOs.
- No unresolved critical/high security issue or privacy blocker remains.
- No provider/vertical is marketed as live without live acceptance evidence.

## 9. Phase 8 — Additional verticals

### Promotion factory

Use the same process for every vertical:

1. Select one user job, region, provider, and capability.
2. Confirm authorized API/commercial access and legal constraints.
3. Map provider data to existing normalized contracts and canonical models.
4. Implement readiness, health, connection, adapter, idempotency, approval, receipt, reconciliation, and kill switch.
5. Run contract, tenant, duplicate-action, failure, cancellation/reversal, accessibility, and support tests.
6. Release to an allowlisted beta cohort.
7. Expand only when SLO and support targets hold.

### Recommended order

#### 8.1 Appointments

- Start with search/availability and hosted provider booking.
- Then add approval-gated create/reschedule/cancel where an authorized API supports idempotency.
- Avoid medical inference; treat health-related appointment data as sensitive.

#### 8.2 Leisure

- Start with events/restaurant discovery and authorized redirect reservations/ticket checkout.
- Add native reservation only with cancellation and no-show/support handling.

#### 8.3 Shopping

- Start with product discovery, comparison, lists, and cart handoff.
- Require exact cart/price approval for checkout; handle substitutions, taxes, shipping, returns, and order reconciliation before native purchase.

#### 8.4 Household

- Start with service discovery and quote/request handoff.
- Add scheduling only when provider identity, insurance/terms, cancellation, dispute, and support flows are clear.

#### 8.5 Smart home

- Start with read-only device/state discovery.
- Add low-risk reversible controls, then routines. Locks, alarms, ovens, garage doors, and safety-critical devices require separate risk review and stronger confirmation.

#### 8.6 Wellness

- Start with user-authorized read-only activity/sleep summaries and non-diagnostic coaching.
- Add granular scopes, short retention, export/deletion, and prominent non-medical limitations.
- Do not introduce diagnosis, treatment, emergency, or clinician claims without a separate regulated-product program.

#### 8.7 Finance

- Keep account/balance/transaction aggregation read-only.
- Add explicit consent, institution status, refresh controls, data minimization, and financial-data retention/deletion.
- Payment initiation, transfers, trading, credit, tax, or personalized regulated advice require separate licensing/compliance and are outside this roadmap until approved.

### Per-vertical exit criteria

- Provider agreement and production capability are documented.
- Search/read and write capabilities are independently gated.
- Exact write arguments are approval-bound.
- Duplicate and uncertain-action tests pass.
- Cancellation/reversal or limitation is visible before approval.
- Support and provider escalation are operational.
- Metrics meet the vertical’s beta SLO for an agreed observation period.

## 10. Delivery slices and dependencies

### Slice A — Connector safety baseline

One-time OAuth state/PKCE, incremental scopes, refresh locking, provider revocation, approval argument hashing, and symmetric Google/Microsoft tests.

### Slice B — Durable execution baseline

`DurableJob`, worker, leases, retry classification, reconciliation jobs, dead-letter UI/API, metrics, and crash drills.

### Slice C — Live travel search

Provider contract decision, normalized offers, freshness/provenance, certification tests, and allowlisted staging search.

### Slice D — Hosted travel checkout

Repricing, prepared transaction, redirect, verified callback, reconciliation, receipt, support view, and beta gate.

### Slice E — Private beta operations

Invites/cohorts, onboarding extensions, feedback intake, dashboards, support runbooks, and controlled expansion.

### Slice F — Production readiness

Security, restore, accessibility, performance, privacy, observability, incident, release, and legal gates.

### Slice G — Vertical promotion

Appointments first, then leisure/shopping/household/smart-home/wellness; finance remains read-only.

Dependencies:

- Slice B is required before connector subscriptions and hosted-checkout callbacks are relied upon.
- Slices A and B are required before private-beta transactional capabilities.
- Slice C can begin after provider access is confirmed and can run alongside Slice B.
- Slice D requires Slices B and C.
- Slice E may begin with read-only/sandbox features, but live writes require A, B, and D.
- Slice F is required for public production release.
- Each Slice G provider repeats the live-provider gates and depends on B, E, and F for public rollout.

## 11. Definition of done for every implementation PR

- Names the canonical owner being extended.
- States why no parallel source of truth is introduced.
- Includes schema migration and rollback/forward-fix notes where applicable.
- Includes tenant-isolation, permission, approval, idempotency, failure, and privacy tests appropriate to the change.
- Adds structured logs/metrics without sensitive payloads.
- Updates provider capability/readiness and user-facing sandbox/live labeling.
- Includes operational behavior for disable, retry, reconcile, and support.
- Updates this plan’s evidence links rather than declaring completion in prose alone.

## 12. Immediate next change

Start with Phase 3 Slice A: introduce one-time OAuth authorization transactions and refresh locking in the existing connector account lifecycle, then add provider-side revocation and cross-provider contract tests. This is isolated from the deferred rollback drill, improves the most mature live-integration area, and establishes patterns reused by every later provider.

In parallel at the planning level, create the Phase 5 durable-job architecture decision and schema proposal before any hosted-checkout callback code is accepted.
