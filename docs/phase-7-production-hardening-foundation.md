# Phase 7 production-hardening foundation

Status: repository foundation implemented; production release remains blocked by live evidence and explicit launch approval.

## Data rights

- `PRIVACY_RIGHTS_ENABLED=false` by default. Disabled environments reject requests without changing state.
- Authenticated users can request an export or account deletion and see only their own request history.
- Deletion requires the exact phrase `DELETE MY ACCOUNT`, is delayed by `PRIVACY_DELETION_GRACE_HOURS` (168 hours by default), and can be cancelled before execution.
- Requests enqueue sanitized durable jobs containing only the request identifier. No exporter or deletion executor is registered yet, so enabling the API alone cannot delete user data.
- Artifact references are designed to store opaque storage identifiers, never public download URLs or export contents.

## Remaining production gates

Phase 7 is not complete until dated evidence exists for security review, dependency and secret scanning, backup restore, WCAG 2.2 AA review, representative load tests, privacy/legal approval, incident exercises, monitoring alerts, rollback, and production smoke tests. Enabling data-rights processing additionally requires reviewed export and deletion executors, encrypted expiring artifact delivery, retention rules, identity re-verification, and a restore-tested operational runbook.

Production activation, DNS changes, destructive restore tests, legal publication, external alerts, and deletion execution require an attended release window and named approvers.
