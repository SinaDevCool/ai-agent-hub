# Local AI threat model

## Protected assets

- Provider credentials and OAuth refresh tokens
- Vault documents, embeddings, and approved excerpts
- Approval decisions and signed approval bindings
- External action arguments and receipts
- Raw prompts and local conversation history
- Model binaries and inference process control

## Trust boundaries

1. React UI to Tauri command bridge
2. Tauri process to the loopback-only inference sidecar
3. Device-generated plan to authenticated backend API
4. Backend runtime to connector/provider APIs
5. Retrieved user content to the language model

## Required controls

| Threat | Control | Verification |
| --- | --- | --- |
| Model selects an undeclared tool | Backend manifest allowlist | Negative API test |
| Search becomes a write | Intent/write invariant and policy re-evaluation | Negation corpus; zero false writes |
| Model invents required arguments | Schema plus missing-field clarification | Missing-field corpus |
| Prompt injection in a document | Treat retrieval as quoted data; no tool authority | Adversarial RAG tests |
| Local webpage reaches inference | Tauri IPC; loopback random port and session token | Cross-origin test |
| Sidecar exposed to LAN | Bind `127.0.0.1` only | Socket inspection test |
| Model supply-chain compromise | Signed manifest and SHA-256 verification | Corrupt download test |
| Credential disclosure | Never include credentials in model context or logs | Redaction tests |
| Approval replay | Existing signed binding, expiry, and atomic claim | Existing replay tests |
| Raw prompt telemetry | Default-off structured metrics only | Telemetry payload test |
| Resource exhaustion | Prompt/output limits, timeout, single-flight queue | Load and timeout tests |

## Data minimization

Local-first execution uploads only the declared tool, normalized arguments required by that tool, intent, missing-field state, risk hints, and non-sensitive runtime provenance. A display string is optional and must be omitted when the user selects device-only prompt handling.

Connector tokens never cross into the local model. The backend injects them only after policy approval at the provider boundary.

## Failure behavior

- Missing/corrupt model: fall back to deterministic rules.
- Invalid model JSON: reject and ask for clarification; do not guess.
- Inference timeout: cancel locally and offer rules-only retry.
- Backend unavailable: permit local-only reading but disable external actions.
- Model disabled by kill switch: use rules mode immediately.

