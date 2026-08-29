# Phase 8 vertical reuse audit

The repository already has canonical capability, provider, approval, transaction, receipt, health, connection, and sandbox layers. Do not create vertical-specific copies of these systems.

| Vertical | Existing canonical foundation | Live gap |
| --- | --- | --- |
| Appointments | appointment records, search/book/reschedule/cancel sandbox, calendar handoff | one approved regional provider and live lifecycle acceptance |
| Finance | accounts, transactions, summaries, simulated payments, finance adapter | regulated partner, consent/reauth, reconciliation and compliance approval |
| Shopping | product search/order sandbox and persistent lists | merchant/provider selection and hosted checkout acceptance |
| Household | provider/quote/book/cancel sandbox | regional provider agreement and dispute/support workflow |
| Leisure | restaurant reservation and event discovery sandbox | one regional live provider and cancellation acceptance |
| Smart home | device read/control and energy sandbox | entity allowlists, local-network bridge, emergency-command policy |
| Wellness | activity read and non-diagnostic plan sandbox | mobile/device connector, health-data review and deletion evidence |

`VERTICAL_RELEASE_GATING_ENABLED=false` preserves current behavior. When enabled, `VERTICAL_RELEASE_RULES` must explicitly name each allowed live provider and release level per domain. Sandbox providers remain usable for tests. Roll out exactly one domain/provider/region combination, beginning with read-only levels, then prepare, then transactional levels after approval and recovery evidence.
