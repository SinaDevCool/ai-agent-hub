# Local AI implementation and rollout

## Implemented architecture

AI Agent Hub uses a hybrid local-first boundary. The desktop process performs prompt interpretation and optional answer generation through a loopback-only `llama.cpp` server. The browser/mobile path uses deterministic rules and sends a typed plan. The backend remains authoritative for agent manifests, permissions, policy, approvals, provider credentials, provider calls, receipts, and audit records.

Raw prompts are not required by `POST /api/me/agents/:agentId/run-plan`. The server accepts a strict interpretation schema plus runtime provenance, rejects undeclared tools, rejects incomplete actions, and applies the same permission and human-approval services as non-model requests.

## Supported model tiers

- Ministral 3 3B Q4 is the default supported laptop model.
- Ministral 3 8B Q4 is opt-in for supported hardware.
- Apertus 8B and Liquid LFM2 remain evaluation-only and cannot be installed from the product manifest.
- Rules are the browser/mobile fallback and emergency rollback mode.

Model downloads are allowlisted with source, exact version, byte length, license, and SHA-256 in `desktop/model-manifest.json`. The `llama.cpp` runtime is independently pinned in `desktop/sidecar-manifest.json` and verified before packaging.

## Developer workflow

1. Install Node 22, Rust stable, and Visual Studio C++ Build Tools on Windows.
2. Run `npm install` in the repository and in `desktop`.
3. Run `npm --prefix desktop run stage:sidecar` to download and verify the pinned runtime.
4. Run `npm run dev:desktop` for the API, frontend, and Tauri shell.
5. Open Settings → Local AI, choose Local only or Local first, install the recommended model, and run Test model.
6. Run `npm run evaluate:local-ai`; release is blocked unless every gate passes.
7. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build:desktop`.

Downloaded model weights live in the operating system's application-local data directory and are removed by Remove model. They are never committed to the repository. Packaged runtime binaries are build artifacts and are also ignored.

## Rollout cohorts

1. Developer accounts: rules plus 3B, local answer generation off.
2. Five allowlisted users: 3B enabled, typed plans enabled, no automatic cloud fallback.
3. Twenty-five supported devices: enable local answers after evaluation and support review.
4. Wider desktop beta: consider 8B on devices meeting the displayed memory recommendation.
5. Browser experiment: rules remain default; any multi-gigabyte WebGPU model requires an explicit download disclosure and separate evaluation.
6. Mobile research: rules only until native 1B–3B battery, heat, and memory measurements pass.

## Flags and rollback

The operator readiness panel reports all flags and the last evaluation artifact. The immediate rollback is:

```env
AI_RUNTIME_MODE=rules
LOCAL_AI_KILL_SWITCH=true
CLOUD_LLM_FALLBACK_ENABLED=false
```

Restart the API after changing environment variables. This disables typed local-model plans while preserving deterministic rules and all backend safety controls.

## Privacy and telemetry

Do not log raw prompts, retrieved document text, model tokens, or connector credentials. Allowed operational telemetry is model/rules version, schema validation outcome, coarse latency bucket, clarification count, selected declared tool, and downstream connector outcome. Retrieved evidence is data, never policy, and cannot add tools or authorize actions.

## Remaining platform experiments

WebLLM and native mobile runtimes are deliberately research tracks, not production claims. They must satisfy the same 500-case suite, approval invariants, storage disclosure, device resource measurements, and signed artifact requirements before their feature flags can be enabled.
