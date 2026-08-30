# ADR: Local-first inference with a server-authoritative execution boundary

Status: Accepted for implementation

## Decision

AI Agent Hub uses a hybrid local-first architecture. Deterministic rules handle unambiguous requests. A device-local model may convert ambiguous language into a strictly validated `InterpretationResult`. The cloud backend remains the sole authority for installed-agent lookup, manifest validation, permissions, approval, connector credentials, tool execution, idempotency, receipts, and audit history.

The initial supported desktop model tiers are Ministral 3 3B Q4 and Ministral 3 8B Q4. Apertus 8B and Liquid LFM2 are evaluation candidates and are not enabled until they pass the repository evaluation and license gates.

## Privacy modes

| Mode | Raw prompt | Interpretation | External actions | Response generation |
| --- | --- | --- | --- | --- |
| Local only | Device | Device | Disabled | Device |
| Local first | Device by default | Device | Typed minimum-data plan sent to backend | Device by default |
| Cloud assisted | Cloud only after explicit opt-in | Cloud or device | Backend | Cloud permitted |

The web compatibility client may continue to send a raw prompt, but it must be labelled as cloud processing. It must not be presented as local-first.

## Invariants

1. Model output is untrusted data, not authorization.
2. Models never receive provider tokens, encryption keys, approval bindings, or unrestricted vault records.
3. A proposed tool must exist in the installed agent manifest.
4. Existing tool policy and human-approval services remain authoritative.
5. A model cannot approve, continue, or replay an action.
6. Raw prompt telemetry is off by default.
7. Device hardware and model files remain local unless the user explicitly opts into diagnostics.
8. `AI_RUNTIME_MODE=rules` is the universal rollback mode.

## Canonical storage

Existing `AgentRun`, `AgentRunStep`, `ToolRun`, `HitlRequest`, `ProviderConnection`, and `ProviderReceipt` records remain canonical. Model provenance is stored in existing run plan/result JSON. Device model files, local history, and hardware detection are not added to Prisma.

## Consequences

This design permits useful offline interpretation and reduces cloud disclosure while retaining centralized enforcement. It adds desktop distribution, model lifecycle, device compatibility, and evaluation responsibilities. Browser and mobile inference remain optional later phases because their lifecycle and hardware constraints are less predictable.

