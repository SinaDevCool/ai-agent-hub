CREATE TABLE IF NOT EXISTS "workflow_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "tool_name" TEXT NOT NULL DEFAULT 'workflow.run',
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'custom',
  "endpoint_url" TEXT NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "last_tested_at" DATETIME,
  "last_success_at" DATETIME,
  "last_failure_at" DATETIME,
  "last_failure_reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "workflow_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workflow_connections_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_status_idx" ON "workflow_connections"("user_id", "status");
CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_agent_id_tool_name_idx" ON "workflow_connections"("user_id", "agent_id", "tool_name");
