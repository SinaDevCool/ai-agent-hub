# Phases 3–8 completion audit — 2026-08-29

This audit compares the repository to the detailed execution plan without treating disabled code or simulated tests as proof of production readiness. The repository consistently reuses `ConnectedAccount`, `ProviderConnection`, `HitlRequest`, `LifeTransaction`, provider delivery/idempotency/receipt records, `DurableJob`, `ActivityLog`, and privacy-rights records. No second OAuth vault, approval engine, transaction engine, queue, or vertical event store is needed.

| Phase | Implemented repository boundary | Remaining external or release gate | Status |
| --- | --- | --- | --- |
| 3 — Google and Microsoft | Gmail/Outlook mail, calendars, Drive/OneDrive, OAuth state/PKCE, encrypted rotating tokens, revocation, scope enforcement, and approval before mail/event writes | Real production OAuth applications, publisher/tenant verification where required, and signed-in staging acceptance | Code-complete behind configuration; activation pending |
| 4 — Live travel | Duffel and Amadeus flight search, normalized live offers, bounded search policy, approval lifecycle, and hosted-checkout foundation | A production-grade live hotel inventory adapter remains absent; checkout/provider agreements, support, refunds, regional terms, and real staging purchases remain external gates | Partially complete; do not call the phase production-complete |
| 5 — Durable jobs | Leases, retry policy, callbacks/webhooks, deduplication, reconciliation, dead letters, recovery controls, provider attempts, idempotency records, receipts, and operational alerts | Hosted queue/worker credentials, load/failure drills, and on-call validation | Code-complete; operational acceptance pending |
| 6 — Private beta | Invite/cohort enforcement, discovery/setup paths, support runbook, feedback/metrics foundations, release gating, and moderation/operations views | Select invite cohort, staff support rotation, targets, consent copy review, and live beta observation | Code-complete; business launch pending |
| 7 — Production release | Security headers, request IDs, rate limits, privacy export/deletion, backup/restore and rollback material, accessibility/performance foundations, health/readiness, incident response, and release evidence tooling | Deployment URLs/secrets, external security/privacy review, accessibility and performance evidence on the deployed build, restore/rollback drills, monitoring/on-call sign-off | Gate framework complete; production sign-off pending |
| 8 — Additional verticals | Cal.com appointments; read-only Plaid finance; Instacart hosted shopping; Google Places household discovery/handoff; Ticketmaster/Places leisure; Home Assistant bounded control; Strava read-only wellness; deterministic sandboxes retained | Every live adapter remains disabled until credentials and staging acceptance. Several verticals intentionally stop at hosted handoff. Provider agreements/compliance determine whether native transactions are ever added | First provider slice complete for each named vertical; broader vertical coverage remains incremental |

## Highest-priority remaining repository work

1. Add a real hotel search adapter and test it against provider sandbox inventory. This is the clearest missing implementation in the original Phase 4 scope.
2. Build one operator-facing activation checklist endpoint/view that derives readiness from flags, credentials, connection state, provider health, last staging drill, and required external sign-offs. Do not create another release state machine; derive from existing records and release evidence.
3. Add deployed end-to-end acceptance for each live flag, including OAuth callback, revocation, tenant isolation, approval replay, provider timeout, and rollback behavior.
4. Complete UI setup flows for newer `ProviderConnection` adapters (Cal.com, Plaid, Home Assistant, and Strava), including scope disclosure, reconnect, revoke, and flag-disabled explanations.
5. Produce deployment-specific security, accessibility, performance, privacy, backup/restore, and incident-response evidence before any production promotion.

## Deliberately deferred

- Native travel, retail, ticket, restaurant, or household purchasing without provider agreements and support operations.
- Finance writes or money movement.
- Smart-home locks, alarms, doors, arbitrary scripts/scenes, or blind retries after uncertain physical actions.
- Medical diagnosis, treatment, medication, emergency decisions, or inference of sleep/health signals from unrelated activity data.
- Apple HealthKit/Health Connect companions, Fitbit sleep, and Garmin Health until their separate mobile, scope, partner, and compliance requirements are approved.

The next autonomous engineering slice should be the missing live hotel search adapter. Production activation work should instead begin with real staging credentials and the acceptance drills above when the user is available to sign in.
