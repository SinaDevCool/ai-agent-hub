DO $$ BEGIN
  CREATE TYPE "WorkflowConnectionStatus" AS ENUM ('draft', 'active', 'failed', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "workflow_connections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "tool_name" TEXT NOT NULL DEFAULT 'workflow.run',
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'custom',
  "endpoint_url" TEXT NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "status" "WorkflowConnectionStatus" NOT NULL DEFAULT 'draft',
  "last_tested_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "last_failure_at" TIMESTAMP(3),
  "last_failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_status_idx" ON "workflow_connections"("user_id", "status");
CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_agent_id_tool_name_idx" ON "workflow_connections"("user_id", "agent_id", "tool_name");

DO $$ BEGIN
  ALTER TABLE "workflow_connections"
    ADD CONSTRAINT "workflow_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_connections"
    ADD CONSTRAINT "workflow_connections_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
