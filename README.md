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
npm run db:seed
npm run dev
```

Backend defaults to `http://localhost:4141`; frontend defaults to `http://localhost:5173`.

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
