# Live household provider decision

## Decision

The first live household slice uses Google Places API (New) for provider discovery and an approval-gated redirect to the business website returned by Place Details. It does not claim that Google Places supplies quotes, availability, booking, payment, cancellation, or service support.

The implementation reuses `HitlRequest` and `LifeTransaction`. Search responses are transient. Only the Google Place ID—which Google explicitly exempts from Places caching restrictions—and the user's own service request are persisted. Provider names, addresses, ratings, review counts, and website URLs are not persisted.

## Safety and privacy boundary

- `LIVE_HOUSEHOLD_ENABLED` and `HOSTED_HOUSEHOLD_HANDOFF_ENABLED` default to `false`.
- The Google API key is server-side and calls use a bounded timeout and explicit cost-limiting field masks.
- Search results mark Google attribution and logo requirements for the client.
- Permanently closed businesses are excluded.
- Approval binds the exact Place ID, service category, location, problem description, and request hash for ten minutes.
- The destination is refreshed after approval using Place Details and must be a public HTTPS URL.
- User-scoped idempotency prevents one key from being reused for another service request, and an atomic state claim prevents duplicate continuation.
- The redirect is recorded as `executing`, never `confirmed`. No quote request, booking, charge, or provider contact occurs in AI Agent Hub.
- Provider search/details calls are read-only and safe to retry after timeout; there is no uncertain external write to reconcile in this slice.

## API surface

- `POST /api/household/live/search`
- `POST /api/household/live/handoff/prepare`
- `POST /api/household/live/handoff/:transactionId/continue`

## External launch gates

Staging and production remain disabled until a restricted Places API key and billing controls are configured, Google attribution and Terms/Privacy links are rendered in the client, EEA terms are reviewed for the billing account, search relevance is tested in launch regions, and usage/cost alerts are active. Quote requests and native bookings require a separate contracted provider with explicit availability, pricing, callback, cancellation, refund, support, and reconciliation contracts.

Official references: [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search), [Places policies and attributions](https://developers.google.com/maps/documentation/places/web-service/policies), and [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id).
