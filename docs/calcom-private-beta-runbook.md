# Cal.com private-beta activation runbook

This runbook turns the existing Appointment Coordinator from a sandbox demonstration into a controlled Cal.com beta. Do not enable live appointments broadly until every release gate in the Operations activation view is green.

## What is already enforced

- Cal.com credentials are encrypted at rest and are never returned to the browser.
- Connection testing calls `GET https://api.cal.com/v2/me` with the required API-version header.
- Availability search is read-only.
- Booking and cancellation require explicit, single-use approval.
- Idempotency and approval replay protection remain active.
- Provider receipts record the external booking reference.
- `LIVE_APPOINTMENTS_ENABLED` is the kill switch.
- Vertical release gates limit live use to the configured beta cohort.

Cal.com currently provides an account-level API key rather than granular OAuth scopes for this integration. The UI therefore discloses the capabilities that AI Agent Hub will use: read availability, read bookings, and create/cancel bookings only after approval.

## One-time operator setup

1. In the staging backend environment, set `CALCOM_WEBHOOK_SECRET` to a long random value.
2. Keep `LIVE_APPOINTMENTS_ENABLED=false` while connecting and testing credentials.
3. Add the intended tester to the appointments beta allowlist using the existing vertical-release configuration.
4. Deploy the backend and frontend.
5. Sign in as a moderator and open **Operations → Cal.com activation**.
6. Confirm that adapter registration, webhook configuration, scope disclosure, release evidence, and sign-off requirements are visible.

## Connect a beta user's account

1. In Cal.com, open **Settings → Developer → API Keys** and create a dedicated beta key.
2. In AI Agent Hub, open **Settings → Connections**.
3. In the Cal.com card, review the disclosed access.
4. Paste the key and select **Connect Cal.com**.
5. Select **Test connection**.
6. Confirm that the status becomes ready and a successful-test timestamp appears.
7. Re-open the operator activation view and confirm an active connection and last successful staging test are shown.

Never paste the key into chat, logs, screenshots, tickets, or release evidence.

## Staging acceptance sequence

Run these cases with a dedicated, disposable Cal.com event type and test attendee:

1. Search real availability and verify returned slots against Cal.com.
2. Request a booking and verify the app pauses before any external write.
3. Deny once and verify no Cal.com booking exists.
4. Repeat the request, approve once, and verify one booking exists.
5. Open **Activity** and confirm the receipt includes the external booking reference.
6. Replay the same approval and verify no duplicate booking is created.
7. Cancel the booking, approve once, and verify both Cal.com and the receipt show cancellation.
8. Revoke or rotate the Cal.com key, test the connection, and verify reconnect-required behavior.
9. Reconnect with a replacement key and verify readiness returns.
10. Exercise timeout/provider-failure handling and verify the UI is retryable without duplicating a write.

## Controlled live enablement

1. Attach the required release-evidence artifact and record product, security, operations, and clinical-safety sign-offs.
2. Confirm the intended tester is the only appointments beta user.
3. Set `LIVE_APPOINTMENTS_ENABLED=true` in staging.
4. Re-open Operations and confirm the kill switch reads enabled and the provider status is ready.
5. Perform one approved booking and immediately verify the receipt and Cal.com booking reference.
6. Monitor provider health, failures, duplicate suppression, approval decisions, and cancellation reconciliation.

If unexpected writes, duplicate bookings, receipt mismatch, or elevated provider failures occur, set `LIVE_APPOINTMENTS_ENABLED=false` immediately. Read-only sandbox behavior remains available while live writes are disabled.

## Revoke or reconnect

Selecting **Disconnect** removes the encrypted credential from AI Agent Hub. For complete revocation, also delete or rotate the key in Cal.com. Reconnect by creating a replacement key, saving it in **Settings → Connections**, and running **Test connection** again.

## Exit criteria before broader rollout

- All activation checks are green.
- Availability, booking, duplicate protection, cancellation, token expiry, timeout, and approval replay have evidence.
- External references appear in receipts and reconcile with Cal.com.
- The kill switch has been tested.
- The beta remains allowlisted.
- Product, security, operations, and clinical-safety sign-offs are recorded.
- Real beta usage and failure data has been reviewed.

Only after those criteria pass should the same activation framework be applied to Plaid, Strava, Home Assistant, and other providers.
