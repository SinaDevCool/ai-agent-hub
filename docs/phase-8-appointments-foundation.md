# Phase 8 appointments foundation

Cal.com is the first live appointments candidate because it already exists in the shared provider catalog and supports availability plus booking lifecycle through one API. The adapter uses API v2 version `2026-02-25`, bearer credentials, request timeouts, approval references, and idempotency keys.

`LIVE_APPOINTMENTS_ENABLED=false` keeps every live request blocked by default. `VERTICAL_RELEASE_GATING_ENABLED` and `VERTICAL_RELEASE_RULES` provide the second release boundary by domain, provider, and release level. Sandbox appointment flows remain available.

Repository coverage includes availability search, approved creation, status/reconciliation reads, and approved cancellation. Formal launch still requires a Cal.com developer/OAuth credential, webhook authentication and replay tests, reschedule acceptance, regional/privacy review, support ownership, staging evidence, and explicit activation. Current endpoint shapes were checked against the official Cal.com API v2 documentation on 2026-08-29.
