# Phase 6 Private Beta Foundation

Status: **product and moderator workflows implemented behind disabled enforcement; live beta evidence remains pending**

## Implemented

- One canonical `BetaInvite` access record with a hashed single-use token, normalized email, cohort, inviter, expiry, redemption, revocation, replacement, and optional redeemed user.
- Serializable cohort-limit checks and atomic replacement so concurrent invite operations cannot silently exceed or corrupt access state.
- Server-side enforcement middleware controlled by `PRIVATE_BETA_ENFORCED=false` by default. Invite redemption and access status remain reachable when enforcement is on.
- Common cohort/user capability rules for discover, read, prepare, redirect, transact, cancel, and reconcile levels. Transactional levels are excluded by default.
- Resumable onboarding progress stored on the existing `User`, covering terms, goals, agent installation, connector review, first task, approvals/history, and support discovery.
- One privacy-safe `BetaFeedback` record rather than a second support chat. Optional run, approval-request, and transaction references are ownership checked.
- Diagnostic intake keeps only explicitly consented release/environment/provider/capability/error identifiers; secrets and prompt/provider payloads are discarded.
- Moderator endpoints for invite lifecycle, feedback triage, and privacy-safe funnel/safety metrics derived from canonical installs, runs, approvals, transactions, and feedback.
- A resumable in-product beta checklist with goals, terms, connector review, first-task, approval, and support milestones.
- A moderator-only Private Beta workspace for one-time invitations, revocation/replacement, cohort metrics, and constrained feedback triage.
- Privacy-safe beta feedback intake with optional release/environment diagnostics and no prompt, credential, or provider-payload collection.
- Curated beta marketplace entry points for travel, money, and daily-task agents.
- Existing export and connector-revocation controls verified, plus self-service scheduled account deletion through the canonical data-rights workflow.

## Rollout controls

- Configured cohort ceilings: team 25, trusted 5, early 25, expanded 100.
- Rollout order remains team dogfood, five trusted users, 10–25 early users, then 50–100 only after safety and support targets hold.
- Expansion pauses for cross-tenant exposure, unauthorized writes, duplicate transactions, reconciliation SLA breach, severe privacy issues, or support-capacity breach.

## Remaining launch work

- Configure notification delivery and support ownership/SLA escalation.
- Run API-bypass, cohort-concurrency, onboarding, diagnostic-redaction, and end-to-end beta exercises in staging.
- Name operational owners and record dated evidence before `PRIVATE_BETA_ENFORCED` is enabled.
- Keep `PRIVATE_BETA_ENFORCED=false` until the invitation allowlist is populated and the staging exercises pass.
