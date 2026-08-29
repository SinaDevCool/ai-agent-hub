# Phase 3 Connector Acceptance

Status: **in progress — live provider acceptance blocked on OAuth application credentials**

This record follows the Phase 3 exit criteria in [`phases-3-8-execution-plan.md`](phases-3-8-execution-plan.md). Phase 4 must not begin until every pending item below is evidenced.

## Implemented evidence

- OAuth authorization state is random, hashed at rest, single-use, expiring, user-bound, and provider-bound through `OAuthAuthorization`.
- Google and Microsoft authorization use PKCE S256.
- Capability-specific incremental scopes are supported by `POST /api/connectors/:provider/start`.
- Access and refresh tokens remain encrypted in the canonical `ConnectedAccount` model.
- Expired-token refresh uses an atomic database lease. The concurrency test proves two callers produce one provider refresh request.
- Google disconnect attempts provider token revocation before clearing local tokens.
- Microsoft disconnect clears local tokens and records that provider-side delegated grant revocation is not supported by the current user-token flow; users can also remove the enterprise-app grant in Microsoft account controls.
- Email send and calendar creation use the canonical `HitlRequest` flow.
- Approval payloads are HMAC-bound to the stored tool and arguments; tampered arguments are blocked before provider execution.
- Google and Microsoft contract tests cover email search/draft/send, calendar read/write, and Drive/OneDrive search.
- Connector readiness is returned as a normal product state so the UI can explain missing provider configuration.
- PostgreSQL migration `0019_connector_oauth_hardening` is applied in staging.

## Verification evidence

- Full repository suite after the initial hardening: 282 tests passed, 0 failed.
- Connector-focused suite after incremental consent and refresh-race coverage: 12 tests passed, 0 failed.
- Typecheck, lint, and production builds passed.
- Staging API health reported `database: ready`, release `d1c5293670267b5661d198b89127ebd3aa53a63a`, and migration `0019_connector_oauth_hardening` on 2026-08-29.
- Cloudflare Pages staging production deployment `7b02739c-a8a3-4e96-af6c-4e9f8cd8d825` contains the updated connector UI and targets the staging API.

## Pending live acceptance

- [ ] Create/configure the Google Cloud OAuth application.
- [ ] Configure Google consent screen/test users and enable Gmail, Calendar, and Drive APIs.
- [ ] Register the exact staging redirect URI: `https://ai-agent-hub-api-staging.onrender.com/api/connectors/google/callback`.
- [ ] Create/configure the Microsoft Entra application.
- [ ] Register the exact staging redirect URI: `https://ai-agent-hub-api-staging.onrender.com/api/connectors/microsoft/callback`.
- [ ] Grant only the delegated Microsoft Graph permissions represented by the capability bundles.
- [ ] Store both client IDs/secrets and redirect URIs in Render staging without exposing them in logs or source control.
- [ ] Connect one Google test account and one Microsoft 365 test account.
- [ ] Verify reconnect, token refresh, denied consent, expired state, replayed state, and disconnect/revoke behavior.
- [ ] Verify Gmail and Outlook search, draft, approved send, and duplicate-resume prevention.
- [ ] Verify Google and Microsoft free/busy, approved event creation, and timezone rendering.
- [ ] Verify Drive and OneDrive metadata search and tenant isolation.
- [ ] Inspect staging logs/activity data for token, message-body, or secret leakage.

## Advancement rule

Phase 3 is complete only when every pending checkbox has dated evidence. Until then, Phase 4 remains pending.
