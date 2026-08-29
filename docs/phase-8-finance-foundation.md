# Phase 8 read-only finance foundation

Plaid is the first implemented live finance candidate because the repository already had a read-only adapter and canonical `FinancialAccount` and `FinancialTransaction` models. This work extends those systems rather than adding a second ledger, connection store, webhook inbox, or job queue.

## Release boundary

`LIVE_FINANCE_ENABLED=false` blocks every live Plaid read by default. `VERTICAL_RELEASE_GATING_ENABLED` and `VERTICAL_RELEASE_RULES` remain the second boundary and should allow only provider `plaid` at read/reconcile levels for an approved cohort. The provider manifest contains no transactional action. Payment creation remains available only as the clearly labeled local sandbox simulation and cannot move money.

## Implemented lifecycle

- `/item/get` records the Plaid Item identifier, consent expiration, consented products, and consented data scopes without storing account or transaction content in logs or durable payloads.
- `/accounts/get` upserts canonical accounts and deletes retained Plaid accounts that are no longer present in the user's current consent grant.
- `/transactions/sync` consumes bounded cursor pages, upserts added and modified transactions, tombstones removed transactions, and advances the cursor only after a complete successful pass.
- `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` restarts from the original cursor as required by Plaid rather than retrying a partial page.
- `ITEM_LOGIN_REQUIRED`, `ACCESS_NOT_GRANTED`, revocation, pending-disconnect, and pending-expiration states update the existing provider connection for reconnect/consent UX.
- Plaid callbacks require an ES256 `Plaid-Verification` JWT, a current issued-at claim, a non-expired matching JWK retrieved from Plaid, and a constant-time match of the exact raw-body SHA-256 hash.
- Verified callback metadata is deduplicated in `ProviderWebhookEvent`, then processed by dedicated durable webhook and reconciliation jobs. Raw financial payloads, access tokens, transaction descriptions, and balances are not copied into job payloads.
- Disconnect calls Plaid `/item/remove` when credentials remain usable, deletes locally retained Plaid accounts and transactions, clears the encrypted connection, and records a sanitized activity result.
- Operational summaries include pending and dead-lettered Plaid webhook/reconciliation jobs.

## Automated acceptance

Coverage includes disabled-by-default behavior, canonical persistence, user isolation through existing connection ownership, removed-account deletion, multi-page cursor handling, mutation-during-pagination restart, expired/revoked consent, ES256 signature failure, replay rejection, body-integrity verification, duplicate callback delivery, durable reconciliation enqueueing, provider Item removal, local data deletion, and proof that the live provider exposes no money-movement action.

## External launch gates

Repository implementation does not establish legal or production readiness. Activation still requires an approved Plaid production account and products, a real Link/update-mode client flow, registered redirect and webhook URLs, launch-country and institution review, consumer-consent and data-retention approval, deletion/1033 review where applicable, support ownership, real sandbox/development callback evidence, production security review, and explicit feature/release-rule activation.

The provider behavior was checked against Plaid's official Transactions Sync, webhook verification, Items, OAuth consent, and Link update-mode documentation on 2026-08-29.
