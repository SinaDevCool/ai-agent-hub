# AI Agent Hub

AI Agent Hub is scaffolded as a local-first, privacy-centric Personal AI Operating System. Agents never read files or call external APIs directly. They request tools from `backend-core`; the secure gatekeeper validates active connection status, schema clearance, restriction rules, and high-risk HITL requirements before releasing data or execution payloads.

## Structure

- `frontend/` - React + Vite dark control-tower UI.
- `backend-core/` - Express, Prisma, SQLite/PostgreSQL-ready backend.
- `backend-core/vault-samples/personal-vault/` - Obsidian-compatible Markdown seed vault.

The personal-life capability/provider catalogue, durable approval-aware transaction lifecycle, supported domains, and provider activation procedure are documented in [`docs/life-platform.md`](docs/life-platform.md).
Release gates, closed-beta metrics, live travel requirements, and the vertical-by-vertical production rollout are documented in [`docs/release-and-rollout.md`](docs/release-and-rollout.md).

## Quick Start

```bash
npm install
copy backend-core\.env.example backend-core\.env
npm run db:push
npm run db:seed
npm run dev
```

Backend defaults to `http://localhost:4141`; frontend defaults to `http://localhost:5173`.

The default seed command creates shared vault schemas and the curated marketplace catalog. New users start with no installed helpers, private notes, or activity. Run `db:seed:sample` only when you intentionally want demo data with installed helpers, sample vault notes, and sample permissions.

PowerShell:

```powershell
$env:SEED_INCLUDE_SAMPLE_USER = "true"
npm run db:seed
Remove-Item Env:\SEED_INCLUDE_SAMPLE_USER
```

## Database Workflow

Local development uses SQLite by default:

```bash
npm run db:push
npm run db:seed
```

Production uses the dedicated PostgreSQL Prisma schema and migration history in `backend-core/prisma/postgres/`:

```bash
npm --workspace backend-core run prisma:generate:postgres
npm --workspace backend-core run db:migrate:postgres
```

Do not use `db:push:postgres` for normal production deploys. It bypasses migration history and is only kept for deliberate development/staging experiments.

To create a new committed PostgreSQL migration after changing the production schema:

```bash
npm --workspace backend-core run db:migration:create:postgres
```

Backend tests use the already-generated Prisma client so Windows does not try to rewrite the Prisma engine DLL during every test run. After changing a Prisma schema, regenerate explicitly before testing:

```bash
npm --workspace backend-core run test:with-generate
```

Marketplace seed data should be run manually and deliberately:

```bash
npm --workspace backend-core run db:seed:postgres
```

The seed is catalog-first by default. It does not create the sample user unless `SEED_INCLUDE_SAMPLE_USER=true` or `--sample-user` is passed, and it does not reset marketplace install counts or average ratings for existing catalog entries.

## Demo Data Cleanup

Local smoke tests and demos create disposable helpers and private notes. Preview cleanup first:

```bash
npm run db:cleanup:demo
```

Delete only records with smoke, QA, test, demo, or sample naming patterns:

```bash
npm --workspace backend-core run db:cleanup:demo -- --confirm
```

The cleanup command is intentionally narrow and dry-run by default. Do not use it as a general production reset.

## Public Demo Checklist

Before sharing a public B2C demo:

- Run `npm run db:cleanup:demo` locally and confirm the preview looks correct.
- Keep production seeding catalog-only; do not seed the sample user in production.
- Verify `/health` returns `ok` after deploy.
- Verify `/health/ready` returns `database: "ready"` after deploy.
- Confirm `FRONTEND_ORIGIN`, Supabase env vars, `DATABASE_URL`, `DIRECT_URL`, `VAULT_ENCRYPTION_KEY`, and `OPENAI_API_KEY` are set on Render.
- Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run smoke:ui`.
- Browse as a normal consumer: first screen -> need -> helper profile -> install -> first prompt.

## Render Deployment

`render.yaml` builds the backend with this production-safe sequence:

```bash
npm install --include=dev
npm --workspace backend-core run prisma:generate:postgres
npm --workspace backend-core run db:migrate:postgres
npm --workspace backend-core run build
```

Normal deploys apply committed migrations only. They do not run `prisma db push` and they do not reseed marketplace data.

Required production environment variables:

- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_ORIGIN`
- `VAULT_ENCRYPTION_KEY`
- `OPENAI_API_KEY`

Production startup validates these values. `FRONTEND_ORIGIN` must be your deployed frontend origin and cannot include localhost. Local `x-user-id` development auth, the sample fallback user, and the local AI runtime fallback are disabled in production; requests must use a valid Supabase bearer token and Render must provide `OPENAI_API_KEY`.

After a backend deploy, run the production smoke against Render:

```bash
BACKEND_BASE_URL=https://<your-render-service>.onrender.com npm run smoke:production
```

This checks public liveness, database readiness, and the production auth guard that rejects spoofed development identity headers.

After both Blueprint services deploy, verify the complete public release surface:

```bash
BACKEND_BASE_URL=https://<api>.onrender.com FRONTEND_BASE_URL=https://<web>.onrender.com npm run verify:release
```

Optional production environment variables:

- `APP_PUBLIC_URL`
- `OPENAI_MODEL`
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`
- `EXTERNAL_RUNTIME_TIMEOUT_MS`
- `EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES`

## Security Model

- Vault files stay local and are parsed through a constrained vault service.
- Markdown frontmatter maps to declared `VaultSchemas`.
- `AgentPermissions` are checked for every vault read, write, and action request.
- High-risk actions return `awaiting_human_approval` and emit WebSocket notifications.
- Verified external helpers run through the backend proxy only after marketplace verification, permission checks, endpoint safety validation, and approval gates.
- Approval requests create notification records and can send email through Resend when `RESEND_API_KEY` is configured.
- `ActivityLog` records file-level access and policy decisions for auditability.

## Approval Email Notifications

For the free MVP path, create a Resend API key and add these backend environment variables on Render:

- `APP_PUBLIC_URL` - your Cloudflare Pages URL, for example `https://ai-agent-hub-417.pages.dev`
- `RESEND_API_KEY` - your Resend API key
- `NOTIFICATION_FROM_EMAIL` - sender address, for example `AI Agent Hub <onboarding@resend.dev>` while testing

If `RESEND_API_KEY` is missing, approvals still work and the activity log shows that email notification is not configured.
