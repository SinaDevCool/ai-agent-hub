# Phase 6 Private Beta Foundation

Status: **implemented behind disabled enforcement; frontend completion and live beta evidence remain pending**

## Implemented

- One canonical `BetaInvite` access record with a hashed single-use token, normalized email, cohort, inviter, expiry, redemption, revocation, replacement, and optional redeemed user.
- Serializable cohort-limit checks and atomic replacement so concurrent invite operations cannot silently exceed or corrupt access state.
- Server-side enforcement middleware controlled by `PRIVATE_BETA_ENFORCED=false` by default. Invite redemption and access status remain reachable when enforcement is on.
- Common cohort/user capability rules for discover, read, prepare, redirect, transact, cancel, and reconcile levels. Transactional levels are excluded by default.
- Resumable onboarding progress stored on the existing `User`, covering terms, goals, agent installation, connector review, first task, approvals/history, and support discovery.
- One privacy-safe `BetaFeedback` record rather than a second support chat. Optional run, approval-request, and transaction references are ownership checked.
- Diagnostic intake keeps only explicitly consented release/environment/provider/capability/error identifiers; secrets and prompt/provider payloads are discarded.
- Moderator endpoints for invite lifecycle, feedback triage, and privacy-safe funnel/safety metrics derived from canonical installs, runs, approvals, transactions, and feedback.

## Rollout controls

- Configured cohort ceilings: team 25, trusted 5, early 25, expanded 100.
- Rollout order remains team dogfood, five trusted users, 10–25 early users, then 50–100 only after safety and support targets hold.
- Expansion pauses for cross-tenant exposure, unauthorized writes, duplicate transactions, reconciliation SLA breach, severe privacy issues, or support-capacity breach.

## Remaining acceptance work

- Extend the existing onboarding UI to display backend progress, terms acceptance, skip/resume, connector review, first-task completion, and support discovery.
- Add invite administration, feedback intake, and beta metrics views to the existing moderator UI.
- Add curated marketplace collections and readiness filters without creating another marketplace.
- Complete export/deletion UX and verify beta-user connector revocation.
- Configure notification delivery and support ownership/SLA escalation.
- Run API-bypass, cohort-concurrency, onboarding, diagnostic-redaction, and end-to-end beta exercises in staging.
- Name operational owners and record dated evidence before `PRIVATE_BETA_ENFORCED` is enabled.
