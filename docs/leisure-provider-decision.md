# Live leisure provider decision

## Decision

The first live leisure slice uses Ticketmaster Discovery API v2 for events and the existing Google Places API (New) adapter for restaurants. Both paths end in an explicitly approved redirect to a refreshed official provider page. AI Agent Hub does not claim ticket inventory, purchase completion, restaurant availability, or a confirmed reservation.

No event, restaurant, ticket, or reservation model is added. Search results remain transient. Canonical `HitlRequest` and `LifeTransaction` rows store only provider identifiers and user-authored selection context.

## Event boundary

- Search ranges are valid and limited to 31 days; TBA, TBD, and test events are excluded.
- Results normalize event ID, start time, venue, location, category, public sales status, and optional price range.
- Approval binds the exact Ticketmaster event ID and user context for ten minutes.
- The event is fetched again after approval. Only an event still marked `onsale` with a safe HTTPS official URL can continue.
- Cancelled, postponed, rescheduled, off-sale, malformed, or unsafe destinations fail closed.
- Redirect state is `executing`, never `confirmed`; purchase state is not available through this integration.

## Restaurant boundary

- Restaurant discovery reuses the Google Places request, normalization, field-mask, timeout, attribution, and caching-policy implementation used by household discovery.
- Only the Place ID and user-authored context are persisted. Google place content and website URLs remain transient.
- Place Details refreshes the authoritative website after approval. Permanently closed businesses or unsafe destinations fail closed.
- The provider website controls availability, party-size support, deposits, pricing, reservation, changes, cancellation, and support.

## Controls and launch gates

`LIVE_LEISURE_ENABLED` and `HOSTED_LEISURE_HANDOFF_ENABLED` default to `false`. Calls have bounded timeouts; read-only provider failures are safe to retry. User-scoped idempotency and atomic state claims prevent duplicate continuation.

Activation requires restricted API keys, Ticketmaster quota monitoring, Google billing controls and attribution UI, regional result QA, public Terms/Privacy links, and product copy that clearly identifies external purchase/reservation. Native ticketing or reservations require partner APIs with order state, callbacks, cancellation/refund, customer support, and reconciliation contracts.

Official references: [Ticketmaster Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/), [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), and [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
