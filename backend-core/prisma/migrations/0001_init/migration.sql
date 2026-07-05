PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "vault_local_path" TEXT NOT NULL,
  "vault_encryption_salt" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "agents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "api_protocol" TEXT NOT NULL,
  "trust_score" INTEGER NOT NULL DEFAULT 70,
  "capability_manifest" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "vault_schemas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "structural_template" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_permissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agent_id" TEXT NOT NULL,
  "vault_schema_id" TEXT,
  "permission_type" TEXT NOT NULL,
  "restriction_rules" TEXT NOT NULL,
  "expires_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_permissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_permissions_vault_schema_id_fkey" FOREIGN KEY ("vault_schema_id") REFERENCES "vault_schemas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "user_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "connection_status" TEXT NOT NULL DEFAULT 'restricted',
  "token_expires_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "user_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_connections_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "vault_documents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "vault_schema_id" TEXT,
  "title" TEXT NOT NULL,
  "relative_path" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "frontmatter" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "vector_provider" TEXT NOT NULL,
  "embedding" TEXT NOT NULL,
  "indexed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vault_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vault_documents_vault_schema_id_fkey" FOREIGN KEY ("vault_schema_id") REFERENCES "vault_schemas" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "action_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "data_accessed" TEXT,
  "dynamic_metadata" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "previous_hash" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "activity_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "hitl_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "action_name" TEXT NOT NULL,
  "risk_level" TEXT NOT NULL DEFAULT 'high',
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_human_approval',
  "expires_at" DATETIME NOT NULL,
  "decided_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hitl_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hitl_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_name_key" ON "agents"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "vault_schemas_name_key" ON "vault_schemas"("name");
CREATE INDEX IF NOT EXISTS "agent_permissions_agent_id_vault_schema_id_permission_type_idx" ON "agent_permissions"("agent_id", "vault_schema_id", "permission_type");
CREATE UNIQUE INDEX IF NOT EXISTS "user_connections_user_id_agent_id_key" ON "user_connections"("user_id", "agent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vault_documents_relative_path_key" ON "vault_documents"("relative_path");
CREATE INDEX IF NOT EXISTS "vault_documents_user_id_vault_schema_id_idx" ON "vault_documents"("user_id", "vault_schema_id");
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_agent_id_created_at_idx" ON "activity_logs"("user_id", "agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "hitl_requests_user_id_agent_id_status_idx" ON "hitl_requests"("user_id", "agent_id", "status");

PRAGMA foreign_keys=ON;
