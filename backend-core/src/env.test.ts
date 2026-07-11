import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

const tsxCli = path.resolve(process.cwd(), "..", "node_modules", "tsx", "dist", "cli.mjs");

function runEnvParse(overrides: Record<string, string>) {
  return execFileSync(process.execPath, [
    tsxCli,
    "-e",
    "import('./src/config/env.ts').catch((error) => { console.error(error); process.exit(1); })"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...overrides
    },
    encoding: "utf8",
    stdio: "pipe"
  });
}

test("production env rejects localhost frontend origin and missing migration direct url", () => {
  assert.throws(
    () => runEnvParse({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://app:secret@example.test:5432/app",
      DIRECT_URL: "",
      FRONTEND_ORIGIN: "http://localhost:5173",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      OPENAI_API_KEY: "",
      VAULT_ENCRYPTION_KEY: "123456789012345678901234"
    }),
    (error) => {
      const output = String((error as { stderr?: Buffer }).stderr ?? "");
      return output.includes("DIRECT_URL is required in production")
        && output.includes("FRONTEND_ORIGIN cannot include localhost origins in production")
        && output.includes("OPENAI_API_KEY is required in production");
    }
  );
});

test("production env accepts explicit auth, database, deployed frontend origins, and AI provider config", () => {
  assert.doesNotThrow(() => runEnvParse({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://app:secret@example.test:5432/app",
    DIRECT_URL: "postgresql://app:secret@example.test:5432/app",
    FRONTEND_ORIGIN: "https://ai-agent-hub.example.com,https://www.ai-agent-hub.example.com",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    OPENAI_API_KEY: "test-openai-key",
    VAULT_ENCRYPTION_KEY: "123456789012345678901234"
  }));
});

test("production API rejects development identity headers without a bearer token", () => {
  const script = `
    import assert from 'node:assert/strict';
    import { createApp } from './src/app.ts';
    async function main() {
      const server = createApp().listen(0);
      const address = server.address();
      const baseUrl = 'http://127.0.0.1:' + address.port;
      try {
        const response = await fetch(baseUrl + '/api/agents', {
          headers: {
            'x-user-id': 'production-header-spoof',
            'x-request-id': 'production-auth-check'
          }
        });
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('x-request-id'), 'production-auth-check');
        const payload = await response.json();
        assert.equal(payload.error.code, 'auth_required');
        assert.equal(payload.error.requestId, 'production-auth-check');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;

  assert.doesNotThrow(() => execFileSync(process.execPath, [
    tsxCli,
    "-e",
    script
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://app:secret@example.test:5432/app",
      DIRECT_URL: "postgresql://app:secret@example.test:5432/app",
      FRONTEND_ORIGIN: "https://ai-agent-hub.example.com",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      OPENAI_API_KEY: "test-openai-key",
      VAULT_ENCRYPTION_KEY: "123456789012345678901234"
    },
    encoding: "utf8",
    stdio: "pipe"
  }));
});
