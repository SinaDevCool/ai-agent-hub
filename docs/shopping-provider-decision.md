# Live shopping provider decision

## Decision

The first live shopping integration uses Instacart Developer Platform shopping-list pages. The backend sends an explicitly approved list of item names and quantities, receives an expiring Instacart URL, and hands the user off. Instacart performs product matching and owns store selection, availability, substitutions, prices, fees, taxes, payment, fulfillment, and support for the resulting purchase.

This deliberately reuses `ShoppingList`, `HitlRequest`, and `LifeTransaction`. It does not add a duplicate product, cart, checkout, or order table.

## Safety boundary

- `LIVE_SHOPPING_ENABLED` and `HOSTED_SHOPPING_CHECKOUT_ENABLED` default to `false`.
- The API key remains server-side and the provider request has a bounded timeout.
- Approval binds the exact normalized title, line items, quantities, and cart hash for ten minutes.
- Idempotency keys are scoped to the user and conflicts fail closed.
- Only HTTPS URLs on `instacart.com` subdomains are accepted.
- Links expire after one day. The application never collects payment data.
- A redirect is recorded as `executing`, never `confirmed`. Instacart Developer Platform exposes no order receipt/status webhook for this flow.
- Provider-call ambiguity transitions the transaction to `uncertain` and disables automatic retries because the create endpoint has neither an idempotency key nor a link-lookup API.

## API surface

- `POST /api/shopping/hosted-checkout/prepare`
- `POST /api/shopping/hosted-checkout/:transactionId/continue`

The first call creates the exact-cart approval. The second requires that unexpired approval, atomically claims the transaction, creates the hosted page once, and returns the allowlisted URL.

## Launch gates outside the repository

Staging and production remain disabled until an Instacart development key is installed, matching accuracy is tested, the required Instacart CTA/brand treatment is implemented in the client, Instacart review is passed, and a production key is issued. Native orders remain out of scope until a provider exposes contractual order, payment, support, refund, and reconciliation APIs.

Official references: [Create shopping list page](https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page), [shopping list flow](https://docs.instacart.com/developer_platform_api/guide/concepts/shopping_list/), and [pre-launch checklist](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/pre-launch_checklist).
