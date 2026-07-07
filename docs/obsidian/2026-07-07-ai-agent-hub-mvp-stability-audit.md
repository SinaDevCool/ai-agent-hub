---
title: AI Agent Hub MVP Stability Audit
date: 2026-07-07
status: draft
tags:
  - ai-agent-hub
  - mvp
  - audit
  - b2c
---

# AI Agent Hub MVP Stability Audit

## Executive Summary

AI Agent Hub has moved beyond a visual prototype. The current codebase already supports a real B2C MVP loop: sign in, add or install an AI helper, store private information, grant category-based access, chat with a helper, pause sensitive actions for approval, and see activity receipts.

The main MVP question is no longer "does the app exist?" It is now: "can a normal consumer trust this app to manage AI helpers safely and understand what is happening?"

The answer is close, but not finished. The strongest parts are the Supabase auth integration, agent marketplace/install flow, permission model, human approval queue, private info CRUD, activity logging, and responsive UI work. The weakest parts are LLM cost readiness, production configuration drift, limited backend test coverage, simplified agent runtime/tool execution, and some remaining B2C clarity around what a "real agent" can actually do.

## Thread Decisions Captured

- Product direction: B2C platform where normal people can add, manage, and use AI agents/helpers.
- Deployment stack: Supabase for auth/database, Render free tier for backend, Cloudflare Pages for frontend.
- Current production URLs:
  - Frontend: `https://ai-agent-hub-417.pages.dev`
  - Backend: `https://ai-agent-hub-q3b1.onrender.com`
  - Supabase project: `https://gpcdbncuoukyqdjblnhr.supabase.co`
- OpenAI runtime was wired to Render, but API usage requires paid credits or billing setup.
- Product roadmap direction:
  - Agent Hub marketplace
  - Install/add agents to profile
  - Real chat/use screen for each agent
  - LLM runtime and safe tool calling
  - Mobile-first agent usage
  - Desktop management workspace
  - Creator publishing flow
  - Ratings, reviews, trust signals
  - Advanced integrations
  - Monetization later

## Architecture Map

### Frontend

Location: `frontend/`

- React 19 + Vite.
- Supabase browser auth via `frontend/src/api/supabaseClient.ts`.
- API wrapper with bearer token via `frontend/src/api/client.ts`.
- Main app UI in `frontend/src/App.tsx`.
- Main styling in `frontend/src/styles/app.css`.
- Cloudflare Pages deploy with:
  - `VITE_API_BASE_URL=https://ai-agent-hub-q3b1.onrender.com`
  - `VITE_WS_URL=wss://ai-agent-hub-q3b1.onrender.com/ws`
  - `VITE_SUPABASE_URL=https://gpcdbncuoukyqdjblnhr.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=...`

### Backend

Location: `backend-core/`

- Express 5 API server.
- Prisma data model with Postgres and SQLite variants.
- Supabase JWT verification for production auth.
- Routes:
  - `/health`
  - `/api/agents`
  - `/api/marketplace`
  - `/api/me/agents`
  - `/api/vault`
  - `/api/permissions`
  - `/api/activity`
  - `/api/mcp`
  - `/api/hitl`
- OpenAI Responses API runtime in `backend-core/src/services/openAiRuntimeService.ts`.
- Local fallback runtime when OpenAI is missing, blocked, out of quota, or fails.

### Database

Prisma models already cover the MVP foundation:

- Users
- Creator profiles
- Marketplace agent definitions and versions
- User agent installs
- User-created agents
- Agent conversations and messages
- Vault schemas and documents
- Agent permissions
- User connections
- Activity logs with hash chaining
- Human approval requests
- Notifications

## What Works Today

- Users can sign in with Supabase magic-link auth.
- Users can create a custom helper.
- Users can install a marketplace helper.
- Users can add, edit, upload, delete, and search private info.
- Helpers start restricted.
- Users can grant specific private info categories to a helper.
- Helpers can search approved private info.
- High-risk actions create human approval requests.
- Users can approve or deny sensitive actions.
- Activity log records reads, grants, blocks, writes, approvals, and agent events.
- Realtime refresh exists through WebSocket events.
- Mobile and desktop layouts both exist.
- Playwright smoke tests cover major B2C flows.
- OpenAI runtime is integrated and safely falls back when the API cannot be used.

## Backend Audit

### Auth And User Isolation

Status: strong MVP foundation.

Supabase auth is wired through bearer tokens. In production, backend auth requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`, and requests without a valid user context are blocked by `requireUser`.

Important MVP risk: local development allows a fallback sample user when Supabase is not configured. That is useful for development but should stay impossible in production.

Recommended P0:

- Add one explicit production startup check that logs all required production env vars without values.
- Add a backend test proving unauthenticated `/api/*` calls return `401`.
- Keep `x-user-id` development bypass disabled whenever Supabase auth is configured.

### Agent Runtime

Status: useful MVP simulation with real LLM response support.

The runtime supports:

- Search intent
- Action intent
- Permission checks
- HITL pause for high-risk actions
- Conversation persistence
- OpenAI answer generation when configured
- Local fallback when OpenAI is unavailable

Current limitation: these are internal AI helpers, not arbitrary external agents yet. Real third-party tool execution is not implemented. `action.execute` currently simulates completion or creates an approval request.

Recommended P0:

- Show OpenAI fallback reason in the UI when the backend returns local mode.
- Persist `providerFallbackReason` in conversation message metadata.
- Add cost and usage guardrails before real user traffic.
- Keep `OPENAI_MODEL=gpt-4o-mini` for MVP cost control.

Recommended P1:

- Add a real safe tool adapter interface:
  - `toolId`
  - input schema
  - permission category
  - high-risk flag
  - dry-run result
  - execute result
- Keep every external action behind HITL until the trust model is stronger.

### Vault And Private Info

Status: good MVP core.

Private info is stored per user in `VaultDocument`, not just in local files. Manual entry, file upload, edit, delete, reindex, and search all exist.

Current limitation: `VAULT_LOCAL_PATH` and `SYNC_MODE=local` still exist from the local-first prototype. They are useful for sample indexing, but for B2C production the primary product mental model should be "your private info in your account", not "a server local vault folder".

Recommended P0:

- Rename UI copy from technical "vault" language to "Private Info" everywhere visible to users.
- Document that production user notes live in Supabase/Postgres.
- Avoid exposing `vaultPath` in public `/health`.
- Add export and delete account/data roadmap item.

### Permissions

Status: strong MVP differentiator.

Permissions are per user, per agent, per vault schema, and per permission type. This matches the B2C promise: users choose what helpers can read.

Current limitation: rules exist as JSON, but the UI mostly exposes category grants. That is fine for MVP. Do not make rules too complex for consumers yet.

Recommended P0:

- Keep permission UI focused on yes/no category access.
- Add plain language receipts after granting or revoking access.
- Add one backend integration test for "agent cannot read a category until permission is granted."

### HITL Approval

Status: good MVP core.

High-risk actions pause for approval. The user can approve or deny, and activity is logged.

Current limitation: after approval, the agent continuation is still simulated. That is acceptable for MVP if copy is honest.

Recommended P0:

- Make UI copy say "approved to continue" instead of implying a real-world booking/payment happened.
- Add an approval expiry explanation.
- Add backend test for approve/deny lifecycle.

### Marketplace And Installs

Status: useful MVP foundation.

Marketplace definitions, active versions, installs, install counts, creator profiles, trust scores, and installed state are modeled.

Current limitation: marketplace search is in-memory after DB fetch. That is fine for small MVP but not enough for a large public marketplace.

Recommended P0:

- Keep marketplace seeded and curated.
- Do not open public creator publishing until consumer install/use flow is stable.
- Add "installed", "needs permission", and "can take actions" trust labels.

Recommended P1:

- Add creator submission as an admin-reviewed flow, not open self-publishing.
- Add rating/review models only after enough real usage exists.

### Activity Logging

Status: strong MVP trust signal.

Activity logs are hash chained and realtime-broadcast. This supports a consumer-facing receipt model.

Current limitation: hash chain is created, but there is no visible "verify log integrity" user or admin flow.

Recommended P0:

- Keep the user-facing activity copy simple.
- Add filters: reads, approvals, blocks, changes.
- Add "why this happened" details for each receipt.

Recommended P2:

- Add admin integrity verification endpoint for the hash chain.

### Production Configuration

Status: works, but has drift.

The real Render env includes OpenAI variables, but `render.yaml` currently does not list all required production env keys, including `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.

Recommended P0:

- Update `render.yaml` with all required env var names, using `sync: false` for secrets.
- Keep non-secret defaults such as `OPENAI_MODEL=gpt-4o-mini`.
- Keep `.env.render.example` as the full deployment checklist.
- Add a small startup diagnostic endpoint or log that says which integrations are configured without exposing secrets.

### Security And Abuse Controls

Status: acceptable for personal MVP testing, not enough for open B2C traffic.

Existing positives:

- Helmet is enabled.
- CORS is restricted by `FRONTEND_ORIGIN`.
- Supabase JWT auth is used.
- Zod validates request bodies.
- OpenAI failures fall back safely.

Gaps:

- No rate limiting.
- No per-user LLM budget.
- No request size or frequency controls beyond JSON body limit.
- No audit around prompt injection.
- No production data deletion flow.
- No explicit privacy policy/product safety page.

Recommended P0:

- Add basic API rate limiting.
- Add per-user daily/monthly LLM usage counters before larger testing.
- Add a privacy/safety page or settings panel explaining what agents can and cannot do.

## Frontend Audit

### B2C Product Clarity

Status: improved, but still needs polish.

The current UI now uses consumer language such as "AI helpers", "Private Info", "Permissions", and "Activity". This is much better than the early technical dashboard.

Remaining risk: the product still carries technical concepts such as MCP, vault, provider fallback, runtime, and manifest. These should be hidden or translated for normal users.

Recommended P0:

- Default UI should answer:
  - What helper do I have?
  - What can it read?
  - What did it do?
  - What does it need from me?
- Hide MCP/OpenAPI labels behind details or admin/dev mode.

### Mobile UX

Status: usable MVP, recently improved.

The app has mobile-specific home, section routing, mobile helper cards, tab-focused views, and Playwright mobile smoke coverage.

Remaining risk: the app still has a lot of functionality for a phone screen.

Recommended P0:

- Mobile first screen should prioritize:
  - selected helper
  - next action
  - pending approval
  - quick chat
- Move management-heavy controls to secondary screens.

### Desktop UX

Status: acceptable MVP workspace.

Desktop is better suited for managing helpers, permissions, and private info. This matches the product roadmap: mobile-first usage, desktop management workspace.

Recommended P0:

- Keep desktop as workspace.
- Reduce repeated panels and make "selected helper" the center of the page.
- Add clear empty states for first-time users.

### Error And Loading States

Status: partially good.

The frontend translates some technical errors with `friendlyAppError`, including Supabase/session, Render wake-up, and network errors.

Recommended P0:

- Add specific user copy for OpenAI quota/billing fallback.
- Add retry action for agent chat failure.
- Add "backend waking up" message on first request.

## MVP Readiness Scorecard

| Area | Status | MVP Readiness |
|---|---:|---|
| Auth | Real Supabase auth | High |
| User-owned private info | Real DB-backed CRUD | High |
| Add/install helpers | Real app flow | High |
| Helper chat | Real persisted conversations | Medium-high |
| OpenAI answers | Integrated, blocked by credits if unpaid | Medium |
| Safe permissions | Real permission gate | High |
| HITL approval | Real approval workflow, simulated execution | Medium-high |
| Marketplace | Seeded curated marketplace | Medium |
| Creator publishing | Not MVP-ready | Low |
| Real external tool calling | Not MVP-ready | Low |
| Mobile B2C UX | Usable, needs more simplification | Medium |
| Backend tests | Too light | Medium-low |
| Security/abuse controls | Needs rate and cost limits | Medium-low |
| Production config | Works, but drift exists | Medium |

## P0 Before Calling This A Stable MVP

These are the minimum improvements before presenting the app to real non-technical testers.

1. Production config hardening
   - Update `render.yaml` with all current env var names.
   - Add safe config diagnostics.
   - Remove public `vaultPath` from `/health`.

2. OpenAI/runtime transparency
   - Surface local fallback reason in the UI.
   - Persist fallback reason in conversation metadata.
   - Add clear copy when billing/quota blocks real AI answers.

3. Backend safety tests
   - Test unauthenticated API rejection.
   - Test agent cannot read private info before permission.
   - Test grant -> search -> activity log.
   - Test high-risk action -> pending approval -> approve/deny.

4. B2C first-run flow
   - Make first-run path one obvious journey:
     - add helper
     - add private note
     - grant one permission
     - ask first question
   - Avoid showing marketplace, settings, and advanced controls too early.

5. Cost and abuse guardrails
   - Add request rate limiting.
   - Add per-user OpenAI usage counters.
   - Add maximum response/token defaults.

## P1 After P0

1. Improve marketplace trust
   - Better helper detail pages.
   - Plain-language risk summary.
   - Creator verification status.
   - Install reason and uninstall clarity.

2. Improve private info management
   - Better categories.
   - Better import flow.
   - Bulk delete/export.
   - Show which helpers can access each item.

3. Improve chat experience
   - Conversation list.
   - Rename/delete conversations.
   - Suggested follow-ups.
   - Better approval continuation.

4. Improve mobile use
   - Mobile bottom navigation.
   - Pending approval banner.
   - One-tap selected helper chat.

## P2 Platform Roadmap

1. Real tool integrations
   - Calendar
   - Email drafts
   - Travel search
   - Shopping or subscription audit
   - Finance read-only integrations first

2. Creator publishing
   - Creator profile
   - Submit helper
   - Review queue
   - Versioning
   - Admin approval

3. Reviews and trust signals
   - Ratings
   - Review moderation
   - Install count
   - Security badges
   - Policy compliance history

4. Monetization
   - Paid plans only after stable usage.
   - Stripe subscriptions or marketplace revenue share later.

## Acceptance Criteria For Stable MVP

The MVP is stable when a new consumer can do all of this without developer help:

- Sign in.
- Add a recommended helper.
- Add one private info note.
- Understand what the helper wants to read.
- Grant exactly one category.
- Ask the helper a question.
- Get either an OpenAI answer or a clear fallback explanation.
- See the receipt of what was accessed.
- Trigger a sensitive action and approve or deny it.
- Remove the helper or revoke access.
- Use the same flow on mobile without confusion.

Technical acceptance criteria:

- `npm run build` passes.
- Playwright smoke tests pass locally.
- Backend auth/permission/HITL integration tests exist.
- Production `/health` shows safe integration status only.
- Render and Cloudflare env variables are documented and aligned.
- OpenAI cost limit exists before public testing.

## Recommended Next Implementation Order

1. P0 config hardening and diagnostics.
2. P0 runtime fallback UI and conversation metadata.
3. P0 backend integration tests.
4. P0 first-run journey simplification.
5. P0 cost/rate guardrails.

After those are complete, the app is ready for a small private MVP test with real users.
