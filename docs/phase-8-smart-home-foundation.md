# Phase 8 smart-home provider foundation

The first live smart-home slice integrates Home Assistant without creating a second device or action lifecycle. Per-user configuration uses the existing encrypted `ProviderConnection`; approved physical actions and ambiguous outcomes use the existing `HitlRequest`, `LifeTransaction`, provider receipt, and idempotency infrastructure. Entity state remains transient and is not copied into a device inventory table.

## Safety boundary

- `LIVE_SMART_HOME_READ_ENABLED` and `LIVE_SMART_HOME_CONTROL_ENABLED` default to `false` and are independent.
- `HOME_ASSISTANT_ALLOWED_ORIGINS` is an operator-controlled exact-origin allowlist. User credentials cannot turn the backend into an arbitrary URL fetcher. Redirects are rejected.
- Each encrypted Home Assistant connection must include `baseUrl`, `accessToken`, and a comma-separated `entityAllowlist`. Every read and command is checked against that per-user allowlist.
- Reads call `GET /api/states/{entity_id}` and return a small normalized state projection. Access tokens and unrestricted attributes are never returned.
- Controls require the runtime's approval override to match the exact `approvalRequestId`, plus an idempotency key. The adapter reads the current entity state immediately before dispatch and rejects a supplied `expectedState` mismatch.
- The initial command registry contains only `light.turn_on`, `light.turn_off`, `switch.turn_on`, `switch.turn_off`, and `climate.set_temperature` between 16 and 26 degrees. Toggle, lock/unlock, covers, alarms, scenes, scripts, arbitrary services, and arbitrary payload fields are rejected.
- Read failures may be retried by the shared provider retry policy. Write failures after dispatch are never marked retryable. They create or update a canonical `LifeTransaction` in `uncertain` state with manual reconciliation guidance.

Home Assistant documents bearer authentication, state reads, and service calls in its official [REST API reference](https://developers.home-assistant.io/docs/api/rest/). Its service endpoint can return states changed during execution, but that list is not proof that only the requested entity changed. The adapter therefore reports a missing target state as `reconciliationRecommended` rather than claiming confirmation from unrelated changed states.

## Rollout

1. Keep both flags disabled while creating a separate staging Home Assistant user with least privilege and a short entity allowlist.
2. Add only the exact staging origin to `HOME_ASSISTANT_ALLOWED_ORIGINS`; include scheme and port, with no path.
3. Create the user's Home Assistant provider connection through the existing provider-connection API. The long-lived token is encrypted at rest and omitted from serialized responses.
4. Enable read only, test connection ownership and allowlisted state reads, and inspect provider receipts for unauthorized or unreachable attempts.
5. Enable control only for an internal cohort. Exercise lights, switches, and the thermostat bounds; deliberately simulate a post-dispatch timeout and complete manual reconciliation.
6. Disable the control flag immediately for unexpected effects. Delete or revoke the provider connection to remove local credentials; revoke the long-lived token in Home Assistant to invalidate it at the source.

Production enablement requires a real Home Assistant instance, operator origin configuration, user token creation, network reachability, and the staging drill above. None of those credentials or manual steps are fabricated by this repository change.
