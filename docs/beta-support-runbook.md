# Private Beta Support Runbook

## Triage targets

| Category | Initial response | Escalation target |
| --- | ---: | --- |
| Access or invite | 1 business day | Beta operations owner |
| Connector or provider | 4 business hours | Integration owner |
| Uncertain transaction | 1 hour | Provider operations owner |
| Privacy or security | 15 minutes | Incident commander and security owner |
| General usability | 2 business days | Product owner |

Critical privacy/security reports and suspected unauthorized or duplicate external actions pause cohort expansion immediately.

## Safe investigation

1. Locate the feedback record and use only its consented request, run, transaction, release, environment, provider, capability, and error identifiers.
2. Correlate through `AgentRun`, `ToolRun`, `HitlRequest`, `LifeTransaction`, `ProviderTransactionAttempt`, `ProviderWebhookEvent`, `DurableJob`, and `ProviderReceipt` as applicable.
3. Never request or copy OAuth tokens, API keys, passwords, complete email bodies, prompt bodies, passenger identity data, or raw provider payloads into support notes.
4. For uncertain actions, reconcile provider state before retrying. Never repeat a write merely because the user returned from hosted checkout or the first request timed out.

## Response macros

- Reconnect: explain that access is no longer valid, direct the user to reconnect the specific account, and confirm no action will continue automatically.
- Failed approval: explain whether it expired or was denied; require a new review if any argument changes.
- Uncertain action: state that provider confirmation is pending and that the original action will not be submitted again blindly.
- Cancellation/refund: identify which supplier owns fulfillment, quote confirmed provider terms only, and provide the recorded escalation route.
- Deletion: acknowledge the request, state the configured retention window, and track export/deletion orchestration without placing private content in the ticket.
