# Phase 1 staging acceptance evidence

Date: 2026-08-29  
Environment: staging only  
Staging branch: `codex/private-beta-staging`

## Release identity

- Frontend: https://ai-agent-hub-staging.pages.dev/
- Backend: https://ai-agent-hub-api-staging.onrender.com
- Render service: `srv-da9bophf2nfc73f11550`
- Accepted release: `a13ef7746fc67e8021959dea01a402d9129ed55f`
- Readiness environment: `staging`
- Database state: `ready`
- Applied migration version: `0018_enable_rls`
- Production `master` was not advanced during this acceptance run.

## Database and catalog

- The empty staging PostgreSQL project migrated through all 18 committed migrations.
- Migration SQL encoding checks prevent BOM or invalid migration encodings.
- The staging catalog contains 13 agent definitions and 13 versions.
- The acceptance account and all exercised records are synthetic. No real customer data was introduced.

## Automated verification

- Backend suite passed after the final runtime fix (279 tests: the prior 277-test baseline plus two flight-input regression tests).
- Frontend suite passed: 59 tests.
- Frontend lint passed.
- Frontend production build passed.
- Local Playwright journeys previously passed: 3.
- Final deployed release verification passed for backend liveness, backend readiness, frontend shell, and SPA rewrite (all HTTP 200 after forward restoration).
- Deployed CORS preflight from the staging Pages origin previously returned HTTP 204 with the staging origin and credentials enabled.

## Authentication and deployed UI

- Supabase email authentication and signup are enabled in the staging project.
- The synthetic, auto-confirmed account authenticated through the deployed frontend.
- Because the synthetic address has no inbox, a password sign-in form was added behind the compile-time gate `VITE_APP_ENV === "staging"`.
- Tests confirm the password form is absent outside staging builds.
- A strong temporary password was reset without deleting or recreating the account. The temporary local credential file was removed after sign-in, and no credential or session token was printed.
- The deployed shell showed the `staging` environment label and a live backend connection.

## Marketplace and agent runtime

- The deployed marketplace loaded and showed 13 agents: 12 available plus the installed Trip Companion.
- Trip Companion's installed state was visible and the installed agent opened successfully.
- Complete flight requests now produce structured route, date, and passenger inputs. This fixed a defect found during UI acceptance and is covered by regression tests in release `a13ef77`.
- Runtime safety behavior is correct when an outside workflow is absent: flight search is blocked with setup guidance rather than inventing provider results.

## Human approval acceptance

The following flow was exercised entirely through the deployed staging UI:

- `Book a hotel for my trip` paused with a visible approval request.
- Deny cleared the request and displayed that nothing would continue.
- A second request paused independently.
- Allow once consumed the second approval and resumed the action automatically.
- The chat displayed successful completion of the approved synthetic action.
- Replaying `Continue approved action: book non-refundable travel` was blocked because no unused, unexpired approval remained.
- Activity history visibly recorded waiting, denied, allowed-once, completed, and blocked outcomes.

No real booking, payment, appointment, communication, provider mutation, or customer record was used.

## Sandbox journeys and receipts

Previously verified through authenticated staging APIs:

- Flight and hotel search returned two offers each.
- Flight and hotel booking returned confirmed synthetic transactions.
- Flight booking replay returned the same transaction ID.
- Flight cancellation quote and cancellation succeeded.
- Appointment search returned three slots and booking confirmed.
- Finance sync returned six synthetic transactions and a simulated payment confirmed.
- Transaction and provider-receipt endpoints returned populated records.

Verified through the deployed UI during this run:

- Activity history is visible.
- The Connected apps filter exposes provider receipts with provider, outcome, guidance, and timestamps.
- Settings exposes confirmed sandbox hotel and payment transactions, a cancelled sandbox flight, a confirmed sandbox appointment, and six read-only finance transactions.
- The Life Services Sandbox and Finance Sandbox are labelled ready; partner and regulated providers remain honestly gated.

## Rollback and forward restoration drill

The drill was performed only on Render staging:

1. Recorded healthy release `a13ef77` with migration `0018_enable_rls`.
2. Rolled back to prior healthy deploy `1c215b6534a53d7d0829dd5b81f1ef4f1ae03223`.
3. Verified HTTP readiness, `database: ready`, `environment: staging`, release `1c215b6`, and migration `0018_enable_rls`.
4. Restored `a13ef7746fc67e8021959dea01a402d9129ed55f`.
5. Verified HTTP readiness, `database: ready`, `environment: staging`, release `a13ef77`, and migration `0018_enable_rls`.
6. Re-enabled Render auto-deploy on commit, which Render disables during rollback.

The migration version remained at `0018_enable_rls` throughout; no destructive down migration or database rollback occurred.

## Known limitations

- Trip Companion has no user-connected outside flight-search workflow. Agent-chat flight search therefore stops with explicit connection guidance. The native life-services flight sandbox is separately available and verified.
- Email delivery is not configured on the staging backend, so approval email notifications are unavailable.
- The Render free instance can spin down during inactivity and incur cold-start delay.
- The staging-only password acceptance form is operational tooling, not a production authentication shortcut.
- Live provider credentials and partner access are intentionally absent; current domain transactions are sandbox-only.

## Exact production blockers

Phase 1 staging infrastructure and safety acceptance are complete, but production promotion remains blocked until later release gates are complete:

- Phase 2 security, privacy, tenant-isolation, lifecycle, webhook, abuse-control, observability, backup/restore, and operational runbook exit criteria.
- A proven logical backup and staging restore drill with defined RPO/RTO.
- Google and Microsoft connector readiness where included in production scope.
- Full final regression, dependency, accessibility, performance, privacy, terms/policy, monitoring, alerting, incident-response, and production smoke evidence.
- Separate production secrets, database migration verification, and production-only synthetic smoke account.
- Any live vertical must pass provider contract, compliance, security, sandbox, idempotency, reconciliation, receipt, monitoring, and removal/revocation gates.

Do not promote `master` or deploy production based solely on this staging acceptance record.
