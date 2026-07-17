ALTER TABLE "workflow_connections" ADD COLUMN IF NOT EXISTS "capability_key" TEXT NOT NULL DEFAULT 'general.research';
ALTER TABLE "workflow_connections" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_capability_key_status_idx" ON "workflow_connections"("user_id", "capability_key", "status");
CREATE INDEX IF NOT EXISTS "workflow_connections_user_id_agent_id_capability_key_idx" ON "workflow_connections"("user_id", "agent_id", "capability_key");
