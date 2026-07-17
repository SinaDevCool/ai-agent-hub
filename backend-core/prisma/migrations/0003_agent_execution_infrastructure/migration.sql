CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planning',
  "intent" TEXT NOT NULL,
  "user_goal" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT '{}',
  "result" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "completed_at" DATETIME,
  CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_runs_user_id_agent_id_created_at_idx" ON "agent_runs"("user_id", "agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_status_created_at_idx" ON "agent_runs"("status", "created_at");

CREATE TABLE IF NOT EXISTS "agent_run_steps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agent_run_id" TEXT NOT NULL,
  "step_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "title" TEXT NOT NULL,
  "input" TEXT NOT NULL DEFAULT '{}',
  "output" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "tool_run_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" DATETIME,
  CONSTRAINT "agent_run_steps_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_run_steps_agent_run_id_created_at_idx" ON "agent_run_steps"("agent_run_id", "created_at");

CREATE TABLE IF NOT EXISTS "tool_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "agent_run_id" TEXT,
  "tool_name" TEXT NOT NULL,
  "input" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "result" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "risk_level" TEXT NOT NULL DEFAULT 'low',
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "hitl_request_id" TEXT,
  "idempotency_key" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" DATETIME,
  "completed_at" DATETIME,
  CONSTRAINT "tool_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tool_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tool_runs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tool_runs_user_id_idempotency_key_key" ON "tool_runs"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "tool_runs_user_id_agent_id_created_at_idx" ON "tool_runs"("user_id", "agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "tool_runs_status_created_at_idx" ON "tool_runs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "tool_runs_tool_name_created_at_idx" ON "tool_runs"("tool_name", "created_at");

CREATE TABLE IF NOT EXISTS "connected_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "account_label" TEXT NOT NULL DEFAULT '',
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "encrypted_access_token" TEXT,
  "encrypted_refresh_token" TEXT,
  "expires_at" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_error" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "connected_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "connected_accounts_user_id_provider_account_label_key" ON "connected_accounts"("user_id", "provider", "account_label");
CREATE INDEX IF NOT EXISTS "connected_accounts_user_id_provider_status_idx" ON "connected_accounts"("user_id", "provider", "status");

CREATE TABLE IF NOT EXISTS "agent_traces" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "agent_run_id" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL DEFAULT 'runtime-v1',
  "input_summary" TEXT NOT NULL DEFAULT '',
  "output_summary" TEXT NOT NULL DEFAULT '',
  "tool_calls" TEXT NOT NULL DEFAULT '[]',
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "token_usage" TEXT NOT NULL DEFAULT '{}',
  "cost_usd" REAL NOT NULL DEFAULT 0,
  "failure_reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_traces_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_traces_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_traces_user_id_agent_id_created_at_idx" ON "agent_traces"("user_id", "agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_traces_agent_run_id_idx" ON "agent_traces"("agent_run_id");
