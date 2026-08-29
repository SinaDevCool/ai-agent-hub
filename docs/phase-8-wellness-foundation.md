# Phase 8 wellness provider foundation

The first live wellness slice uses Strava for read-only activity summaries and local, non-diagnostic routine preparation. It reuses encrypted `ProviderConnection`, provider receipts, OAuth refresh, `LifeTransaction`, privacy export/deletion, activity audit, and vertical release gates. Raw activities are transient: no wellness-record, route, sleep, or health-profile table was added.

## Data and clinical safety boundary

- `LIVE_WELLNESS_ENABLED` defaults to `false`. Production also requires `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
- OAuth requests only `activity:read`. The adapter verifies the scope Strava actually granted. It does not request `activity:read_all`, profile scopes, or any write scope.
- Query windows are limited to 31 days and 200 summary activities. Precise routes, coordinates, polylines, privacy-zone information, athlete profiles, and raw provider payloads are dropped.
- Read responses expose only activity id/name/type, start time, moving minutes, distance, and elevation gain, plus aggregate counts. Tokens never enter results or receipts.
- Routine preparation rejects diagnostic, treatment, medication, rehabilitation, urgent-symptom, eating-disorder, pregnancy, and aggressive-weight-loss requests. The generated 14-day routine is deliberately low intensity, optional, and capped at a five-minute progression.
- Stale or absent activity data never produces progression advice. The result explicitly directs users to qualified clinical or emergency support where appropriate.
- Idempotent plan replay returns the original stored aggregate plan without another Strava request. Reusing a key for a different goal is blocked.
- Disconnect uses Strava's current `POST /oauth/revoke` flow with server-side Basic authentication, then deletes the encrypted local connection. The existing privacy workflow exports or deletes the minimized `LifeTransaction` result.

Strava's official [authentication documentation](https://developers.strava.com/docs/authentication/) defines the requested scope, rotating short-lived tokens, and revocation flow. The official [API reference](https://developers.strava.com/docs/reference/) defines the bounded athlete-activities query.

## Rollout

1. Register a staging Strava API application and configure its callback domain.
2. Store a staging-only client id and secret; never copy production credentials into staging.
3. Keep the wellness flag disabled while completing OAuth with a test athlete.
4. Verify the returned connection lists exactly `activity:read`, refreshes a rotating token, and returns no private-only activities or route geometry.
5. Enable the flag for an internal cohort, exercise recent, empty, stale, revoked, rate-limited, and deletion cases, and inspect provider receipts/privacy exports.
6. Revoke the test connection from the hub and confirm the application disappears from the athlete's authorized apps.

Sleep is not inferred from Strava activity. Apple HealthKit, Android Health Connect, Fitbit, and Garmin remain separate future provider slices because they require mobile companions, additional scopes, partner approval, or distinct compliance review.
