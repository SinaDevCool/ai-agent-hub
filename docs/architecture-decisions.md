# Canonical Architecture and Non-Duplication Rules

This document identifies the single source of truth for each platform concern. New work must extend these components unless an architecture decision explains why replacement is necessary. A replacement must migrate callers and remove the superseded implementation; parallel sources of truth are not permitted.

| Concern | Canonical implementation |
| --- | --- |
| Identity and roles | Supabase Auth plus `User` |
| OAuth identities | `ConnectedAccount` |
| Provider credentials | encrypted `ProviderConnection` records |
| Generic external workflows | `WorkflowConnection` |
| Provider catalogue and readiness | `ProviderDefinition`, `lifePlatformCatalog`, and `lifeProviderReadinessService` |
| Marketplace and versions | `AgentDefinition`, `AgentVersion`, and `UserAgentInstall` |
| Installed runtime | `Agent`, `AgentRun`, `AgentRunStep`, and `ToolRun` |
| Permissions | `AgentPermission` and the permission policy services |
| Human approval | `HitlRequest` |
| Real-world actions | `LifeTransaction` |
| Provider delivery attempts | `ProviderTransactionAttempt` |
| Mutation deduplication | `ProviderIdempotencyRecord` |
| Provider webhook ingestion | `ProviderWebhookEvent` |
| Durable background execution | shared `DurableJob` and `durableJobService`; jobs coordinate work but never replace `LifeTransaction`, provider attempts, webhooks, idempotency, or receipts |
| External-action evidence | `ProviderReceipt` |
| User-visible audit history | `ActivityLog` |
| Notifications | `Notification` and the authenticated realtime hub |
| Private documents | `VaultSchema` and `VaultDocument` |

## Change gate

Every implementation must answer these questions before adding a model, service, route, hook, or page:

1. Which canonical component already owns the concern?
2. Can that component be extended without weakening tenant isolation or lifecycle guarantees?
3. Would the change introduce a second source of truth, approval mechanism, transaction lifecycle, provider registry, receipt, or queue?
4. Which obsolete implementation and tests will be removed if this is a replacement?
5. How do tests prove that retries, webhooks, and concurrent requests cannot duplicate an external action?

Provider-specific adapters may translate external contracts, but they may not own user authorization, approval, idempotency, transaction state, or receipts. Frontend views consume backend readiness and lifecycle decisions; they must not independently infer whether a provider is safe to execute.
