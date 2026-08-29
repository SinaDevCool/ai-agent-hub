# Travel Launch Provider Decision

Status: **engineering decision recorded; commercial and live-provider acceptance pending**

Date: 2026-08-29

## Initial market

- Launch region: Germany first, then the wider EU only after the same legal and support checks pass.
- Initial currency: EUR.
- Flights: Duffel is the primary candidate for attributable offer search and hosted/provider checkout. Amadeus remains a search-only comparison candidate until its contracted production capability is confirmed.
- Hotels: Amadeus is the implemented search-only inventory source. Booking.com Demand and Expedia Rapid remain hosted-checkout candidates; selection requires verified production access, caching/attribution terms, a hosted-checkout capability, support escalation, and cancellation/refund obligations.
- Native booking: disabled.

This decision deliberately avoids presenting sandbox access as production entitlement. No live provider is activated merely because an adapter or credential form exists.

## Engineering boundary

- Flight and Amadeus hotel adapters normalize provider data into `travel-offer.v1` contracts.
- Amadeus hotel search first discovers bounded hotel IDs by IATA city code, then requests live Hotel Search v3 room offers. A selected offer can be refreshed by `offerId` before a later booking handoff.
- Hotel contracts include total multi-room price, reported taxes, room/bed/board details, refundability, cancellation deadline, provider trace, and offer freshness. Malformed individual offers are isolated.
- Amadeus hotel results explicitly declare `hostedCheckoutAvailable: false` and `nativeBookingEnabled: false`; the Self-Service booking API is not treated as a hosted redirect.
- Every live offer identifies its provider, supplier, fetch time, expiry, price/currency, itinerary, and attribution trace.
- Malformed provider items are dropped and the response is marked partial rather than mixing raw and normalized results.
- Live and sandbox offers cannot be combined.
- Searches are bounded by date, passenger/room count, result count, airport/city code, launch currency, and provider timeout.
- Hosted checkout requires both `LIVE_TRAVEL_ENABLED=true` and `HOSTED_TRAVEL_CHECKOUT_ENABLED=true`, an allowlisted HTTPS host, a fresh normalized live offer, exact amount/currency acceptance, and an argument-bound `HitlRequest`.
- Returning from hosted checkout is recorded only as a redirect. Confirmation must arrive through provider verification or a durable reconciliation job.

## External evidence still required

- Executed provider agreement and approved production use case.
- Production/certification credentials and rate-limit evidence.
- Written caching, attribution, deep-link, data-residency, privacy, support, refund, and cancellation terms.
- Live staging offer freshness and repricing exercises.
- Verified hosted checkout callback/webhook and status-polling contract.
- Support escalation contacts and ownership matrix.

Until those items are recorded, both live-travel flags remain false. Search engineering is complete, while Phase 4 production activation and checkout remain externally gated.
