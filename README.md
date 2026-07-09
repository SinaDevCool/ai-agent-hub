# AI Agent Hub

AI Agent Hub is scaffolded as a local-first, privacy-centric Personal AI Operating System. Agents never read files or call external APIs directly. They request tools from `backend-core`; the secure gatekeeper validates active connection status, schema clearance, restriction rules, and high-risk HITL requirements before releasing data or execution payloads.

## Structure

- `frontend/` - React + Vite dark control-tower UI.
- `backend-core/` - Express, Prisma, SQLite/PostgreSQL-ready backend.
- `backend-core/vault-samples/personal-vault/` - Obsidian-compatible Markdown seed vault.

## Quick Start

```bash
npm install
copy backend-core\.env.example backend-core\.env
npm run db:push
npm run db:seed:sample
npm run dev
```

Backend defaults to `http://localhost:4141`; frontend defaults to `http://localhost:5173`.

The default seed command creates shared vault schemas and the curated marketplace catalog. `db:seed:sample` also creates the local demo user, installed demo agents, and sample permissions.

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
npm run db:seed:sample
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

Marketplace seed data should be run manually and deliberately:

```bash
npm --workspace backend-core run db:seed:postgres
```

The seed is catalog-first by default. It does not create the sample user unless `SEED_INCLUDE_SAMPLE_USER=true` or `--sample-user` is passed, and it does not reset marketplace install counts or average ratings for existing catalog entries.

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

Optional production environment variables:

- `APP_PUBLIC_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

## Security Model

- Vault files stay local and are parsed through a constrained vault service.
- Markdown frontmatter maps to declared `VaultSchemas`.
- `AgentPermissions` are checked for every vault read, write, and action request.
- High-risk actions return `awaiting_human_approval` and emit WebSocket notifications.
- Approval requests create notification records and can send email through Resend when `RESEND_API_KEY` is configured.
- `ActivityLog` records file-level access and policy decisions for auditability.

## Approval Email Notifications

For the free MVP path, create a Resend API key and add these backend environment variables on Render:

- `APP_PUBLIC_URL` - your Cloudflare Pages URL, for example `https://ai-agent-hub-417.pages.dev`
- `RESEND_API_KEY` - your Resend API key
- `NOTIFICATION_FROM_EMAIL` - sender address, for example `AI Agent Hub <onboarding@resend.dev>` while testing

If `RESEND_API_KEY` is missing, approvals still work and the activity log shows that email notification is not configured.
