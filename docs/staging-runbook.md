# Staging Environment Runbook

Staging is an isolated deployment of the existing application, not a separate application implementation.

## Required resources

- Cloudflare Pages staging project (or a branch preview with access restricted to the team)
- Render staging API created from the same repository and build/start commands as production
- Separate Supabase project, database, Auth configuration, and redirect allowlist
- Separate Upstash, Resend, Google, Microsoft, and live-provider test credentials
- Separate vault encryption key and provider webhook secrets

Production database URLs, encryption keys, OAuth clients, provider credentials, and webhook secrets must never be copied into staging.

## Backend settings

Set `NODE_ENV=production` so production security is exercised and set `APP_ENV=staging` so the deployment is visibly identified. Required release settings are `RELEASE_SHA` (or Render's `RENDER_GIT_COMMIT`), `MIGRATION_VERSION=0022_data_rights_foundation`, `API_PUBLIC_URL`, and `FRONTEND_PUBLIC_URL`.

Keep `DURABLE_JOBS_ENABLED=false` on both the web service and worker until the Phase 5 failure drills are complete. The web process enqueues only; a separately deployed worker runs `npm --workspace backend-core run start:worker`. Enable one staging worker first, verify queue metrics and dead-letter controls, and only then test concurrent workers.

Use these commands, unchanged from production:

```text
npm install --include=dev
npm --workspace backend-core run prisma:generate:postgres
npm --workspace backend-core run build
npm --workspace backend-core run db:migrate:postgres
npm --workspace backend-core run start
```

The database migration command must run before the new application receives traffic. Do not use `prisma db push`.

## Frontend settings

Set `VITE_APP_ENV=staging`, staging API/WebSocket URLs, and the staging Supabase URL and anonymous key. The UI displays the staging label automatically.

## Seed policy

Run the normal catalogue seed deliberately after the first migration. Never run `db:seed:sample` in hosted environments. A staging acceptance user must be created through the normal authentication flow.

## Promotion gate

1. All GitHub CI jobs pass for the exact SHA.
2. `/health` and `/health/ready` report that SHA, `staging`, and the expected migration.
3. `npm run verify:release` passes against staging.
4. Sign-in, install, first prompt, approval, receipt, transaction history, and sign-out pass.
5. Rollback to the previous Render deployment is exercised without reversing database migrations.

Cloudflare Pages should promote the already-tested frontend artifact or exact commit. Render should deploy the same SHA. A production smoke test is mandatory after promotion.
