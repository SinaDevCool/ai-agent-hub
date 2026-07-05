# Free Deploy Plan

This setup keeps the backend real while staying on free tiers:

- Frontend: Cloudflare Pages
- Backend API: Render Free Web Service
- Database: Supabase Free Postgres

## 1. Supabase

Create a new Supabase project for AI Agent Hub.

Copy two connection strings:

- `DATABASE_URL`: Supabase pooled connection string
- `DIRECT_URL`: Supabase direct connection string

Keep the password private. Do not commit either URL.

## 2. Render Backend

Create a Render Web Service from this repository.

Use the root directory of the repo and these settings:

- Build command: `npm install && npm --workspace backend-core run prisma:generate:postgres && npm --workspace backend-core run db:push:postgres && npm --workspace backend-core run db:seed:postgres && npm --workspace backend-core run build`
- Start command: `npm --workspace backend-core run start`
- Health check path: `/health`
- Plan: Free

Environment variables:

```text
NODE_ENV=production
PORT=4141
DATABASE_URL=<supabase pooled connection string>
DIRECT_URL=<supabase direct connection string>
FRONTEND_ORIGIN=<cloudflare pages url>
VAULT_LOCAL_PATH=./vault-samples/personal-vault
VAULT_ENCRYPTION_KEY=<32+ character random secret>
SYNC_MODE=local
LOG_LEVEL=info
EMBEDDING_PROVIDER=local-hash
```

Render will publish a backend URL similar to:

```text
https://ai-agent-hub-api.onrender.com
```

## 3. Cloudflare Pages Frontend

Create a Cloudflare Pages project from this repository.

Settings:

- Build command: `npm install && npm --workspace frontend run build`
- Build output directory: `frontend/dist`

Environment variables:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
VITE_WS_URL=wss://<your-render-service>.onrender.com/ws
```

After Cloudflare gives you a Pages URL, add it to Render:

```text
FRONTEND_ORIGIN=https://<your-cloudflare-pages-site>.pages.dev
```

For local plus production CORS, use a comma-separated value:

```text
FRONTEND_ORIGIN=http://localhost:5173,https://<your-cloudflare-pages-site>.pages.dev
```

## Free-Tier Notes

- Render free services can sleep and cold-start.
- Supabase free projects can pause after inactivity.
- This is good for MVP sharing, testing, and early feedback.
- It is not a production SLA setup.
