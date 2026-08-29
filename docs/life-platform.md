# Life-agent platform implementation

The hub implements a provider-neutral personal-life capability layer. Agents ask for a capability; the backend selects an eligible provider by region, execution level, connection readiness, and risk policy. Provider secrets remain in encrypted provider connections and are never included in prompts or receipts.

## Capability catalogue and execution status

- Administration: Google and Microsoft email/calendar/document tools are executable after OAuth; Nylas remains account/configuration gated.
- Travel: sandbox flight and hotel search/booking/cancellation, ground transport search, itinerary aggregation, and Google Calendar sync are executable. Amadeus provides credential-gated live flight and hotel search with selected-hotel-offer refresh; Duffel provides credential-gated flight operations. Live booking remains account or partnership gated.
- Appointments: sandbox provider/availability search and booking/rescheduling/cancellation/calendar sync are executable. Real healthcare scheduling remains provider, partnership, and compliance gated.
- Finance: deterministic read-only accounts, transactions, categories, recurring costs, and budget summaries are executable. Approval-gated payment simulation is also executable, but it never contacts a bank or payee and cannot move money. Plaid is credential gated; live payment initiation remains regulated-provider and account gated.
- Household: sandbox provider discovery, quote workflow, approved service booking, and cancellation are executable; real providers remain account or partnership gated.
- Shopping: sandbox product search, checkout preparation, approved order/cancellation, durable user-scoped lists, and a disabled-by-default Instacart hosted-list handoff are executable.
- Household: sandbox discovery, quoting, booking, and cancellation remain available; disabled-by-default Google Places discovery and approval-bound provider-site handoff reuse canonical transactions without claiming a quote or booking.
- Leisure: sandbox events and restaurant reservations remain available; disabled-by-default Ticketmaster event discovery and reused Google Places restaurant discovery support approval-bound external handoffs without claiming purchase or reservation.
- Leisure: sandbox restaurant reservation/cancellation and event discovery are executable; real reservations and tickets remain provider gated.
- Smart home: allowlisted sandbox device read/control and read-only energy analysis are executable; physical integrations require a connected Home Assistant/SmartThings account.
- Wellness: deterministic sandbox flows remain available. A gated Strava adapter adds OAuth-scoped read-only activity summaries and conservative non-diagnostic plan preparation; sleep and broader device health data still require a separately reviewed mobile or provider connection.

`GET /api/life-platform/catalog` returns the canonical capability/provider catalogue. `GET /api/life-platform/capabilities/:key/providers?region=DE&level=discover` returns eligible providers. The provider catalogue records official documentation, regional coverage, authorization model, execution levels, and commercial access requirements.

## Transaction API

Create a durable action plan with `POST /api/life-platform/transactions`. Required body fields are `capabilityKey` and `executionLevel`; optional fields are `region`, `providerId`, `input`, and `idempotencyKey`.

The persisted lifecycle is:

`draft -> validated -> awaiting_approval -> executing -> confirmed`

Read-only actions can move from `validated` directly to `executing`. Provider timeouts after submission move to `uncertain`, then `reconciliation_required`; the caller must query the provider by external reference rather than repeat the purchase. Invalid transitions are rejected. A user/idempotency-key uniqueness constraint prevents duplicate action plans.

## Activating real providers

The implementation deliberately does not ship credentials or claim partner access. Administrators create a provider definition through the existing provider-definition API, declare only supported operations, and connect credentials through the encrypted provider-connection flow. Generic REST, OpenAPI, MCP, OAuth, API-key, and webhook runtimes are already supported.

Suggested rollout for Germany/EU:

1. Google Workspace or Nylas for administration.
2. Amadeus search plus Booking.com/Omio hosted checkout or redirect.
3. Google Places plus provider-owned appointment links; add FHIR/provider partnerships later.
4. Tink or TrueLayer read-only finance.
5. Google Places/Yelp discovery and email-based household quotes.
6. Home Assistant and Tibber for opt-in home/energy use.

Partner-only providers stay unavailable until the business account is approved. Regulated finance and health providers additionally require the appropriate contractual and compliance onboarding.

## Provider contract rules

Every life capability has a canonical, machine-readable input contract. Examples:

- Flight search requires origin, destination, departure date, and passenger count.
- Hotel search requires destination, check-in/out, and guests.
- Appointment search requires specialty and location.
- Finance reads require an authorized connection and bounded date range.
- Purchases, bookings, payments, messages, appointment mutations, and physical device controls require an approval request identifier.

The provider manifest sanitizer strips secret-like fields, external URLs are checked by the URL safety policy, responses are size/time bounded, webhooks are normalized, and receipts omit credentials.

## Marketplace agents

Seeding publishes dedicated Personal Administration, Appointment Coordinator, Leisure Concierge, and Smart Home and Energy agents alongside the existing Trip Companion, Budget Guard, Shopping Scout, Health Notes Organizer, and Home Maintenance Helper. Each manifest declares tools, normalized capabilities, private schemas, high-risk actions, example prompts, and trust reasons.

Third-party agents continue through the existing import safety review, manifest normalization, creator review, moderation, version records, signed/verified runtime restrictions, permission grant, and removal/rollback paths. A2A is reserved for independently hosted agent runtimes; normal data and actions use provider tools.

The native `life-sandbox` and `finance-sandbox` agent adapters match their catalogued capabilities. Their outputs always identify themselves as simulated, state that no external system was contacted, and use synthetic references. They are suitable for agent acceptance testing, not evidence of a real booking, payment, appointment, order, device change, or care event.

## Verification

After schema changes:

```powershell
npm --workspace backend-core run prisma:generate
npm run db:push
npm run db:seed
npm run typecheck
npm test
npm run build
```

Production deployment applies the committed PostgreSQL migrations through `0019_connector_oauth_hardening`; do not replace migration deploy with `db push`.
