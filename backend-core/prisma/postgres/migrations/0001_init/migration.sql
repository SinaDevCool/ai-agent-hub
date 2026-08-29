-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentCategory" AS ENUM ('Financial', 'Executive', 'Wellness', 'Domestic', 'Legal', 'Travel', 'Maintenance', 'Custom');

-- CreateEnum
CREATE TYPE "ApiProtocol" AS ENUM ('OpenAPI', 'MCP');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('read', 'write', 'execute_action');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'restricted', 'revoked');

-- CreateEnum
CREATE TYPE "ActivityActionType" AS ENUM ('agent_created', 'agent_removed', 'vault_read', 'vault_write', 'api_callback', 'execution_triggered', 'permission_requested', 'hitl_requested', 'hitl_approved', 'hitl_denied', 'indexing_completed');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('success', 'blocked_by_policy', 'pending_human_approval', 'error');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "MarketplaceStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('user', 'agent', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "vault_local_path" TEXT NOT NULL,
    "vault_encryption_salt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_definitions" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "AgentCategory" NOT NULL,
    "status" "MarketplaceStatus" NOT NULL DEFAULT 'published',
    "trust_score" INTEGER NOT NULL DEFAULT 70,
    "install_count" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_versions" (
    "id" TEXT NOT NULL,
    "agent_definition_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "api_protocol" "ApiProtocol" NOT NULL,
    "capability_manifest" TEXT NOT NULL,
    "release_notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_agent_installs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_definition_id" TEXT NOT NULL,
    "agent_version_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "display_name" TEXT NOT NULL,
    "connection_status" "ConnectionStatus" NOT NULL DEFAULT 'restricted',
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_agent_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AgentCategory" NOT NULL,
    "api_protocol" "ApiProtocol" NOT NULL,
    "trust_score" INTEGER NOT NULL DEFAULT 70,
    "capability_manifest" TEXT NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ActivityStatus",
    "intent" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_schemas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "structural_template" TEXT NOT NULL,

    CONSTRAINT "vault_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "vault_schema_id" TEXT,
    "permission_type" "PermissionType" NOT NULL,
    "restriction_rules" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "connection_status" "ConnectionStatus" NOT NULL DEFAULT 'restricted',
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vault_schema_id" TEXT,
    "title" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "frontmatter" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "vector_provider" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "action_type" "ActivityActionType" NOT NULL,
    "status" "ActivityStatus" NOT NULL,
    "data_accessed" TEXT,
    "dynamic_metadata" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "previous_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hitl_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'high',
    "payload" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'pending_human_approval',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "continued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hitl_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hitl_request_id" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'email',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "subject" TEXT NOT NULL,
    "provider" TEXT,
    "provider_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_user_id_key" ON "creator_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_definitions_slug_key" ON "agent_definitions"("slug");

-- CreateIndex
CREATE INDEX "agent_definitions_status_category_idx" ON "agent_definitions"("status", "category");

-- CreateIndex
CREATE INDEX "agent_definitions_status_trust_score_idx" ON "agent_definitions"("status", "trust_score");

-- CreateIndex
CREATE INDEX "agent_versions_agent_definition_id_is_active_idx" ON "agent_versions"("agent_definition_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "agent_versions_agent_definition_id_version_key" ON "agent_versions"("agent_definition_id", "version");

-- CreateIndex
CREATE INDEX "user_agent_installs_user_id_connection_status_idx" ON "user_agent_installs"("user_id", "connection_status");

-- CreateIndex
CREATE UNIQUE INDEX "user_agent_installs_user_id_agent_definition_id_key" ON "user_agent_installs"("user_id", "agent_definition_id");

-- CreateIndex
CREATE INDEX "agents_name_idx" ON "agents"("name");

-- CreateIndex
CREATE INDEX "agent_conversations_user_id_agent_id_updated_at_idx" ON "agent_conversations"("user_id", "agent_id", "updated_at");

-- CreateIndex
CREATE INDEX "agent_messages_conversation_id_created_at_idx" ON "agent_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vault_schemas_name_key" ON "vault_schemas"("name");

-- CreateIndex
CREATE INDEX "agent_permissions_user_id_agent_id_vault_schema_id_permissi_idx" ON "agent_permissions"("user_id", "agent_id", "vault_schema_id", "permission_type");

-- CreateIndex
CREATE UNIQUE INDEX "user_connections_user_id_agent_id_key" ON "user_connections"("user_id", "agent_id");

-- CreateIndex
CREATE INDEX "vault_documents_user_id_vault_schema_id_idx" ON "vault_documents"("user_id", "vault_schema_id");

-- CreateIndex
CREATE INDEX "vault_documents_user_id_relative_path_idx" ON "vault_documents"("user_id", "relative_path");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_agent_id_created_at_idx" ON "activity_logs"("user_id", "agent_id", "created_at");

-- CreateIndex
CREATE INDEX "hitl_requests_user_id_agent_id_status_idx" ON "hitl_requests"("user_id", "agent_id", "status");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_hitl_request_id_idx" ON "notifications"("hitl_request_id");

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_definition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "agent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_installs" ADD CONSTRAINT "user_agent_installs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_installs" ADD CONSTRAINT "user_agent_installs_agent_definition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "agent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_installs" ADD CONSTRAINT "user_agent_installs_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_installs" ADD CONSTRAINT "user_agent_installs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_vault_schema_id_fkey" FOREIGN KEY ("vault_schema_id") REFERENCES "vault_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_vault_schema_id_fkey" FOREIGN KEY ("vault_schema_id") REFERENCES "vault_schemas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hitl_requests" ADD CONSTRAINT "hitl_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hitl_requests" ADD CONSTRAINT "hitl_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hitl_request_id_fkey" FOREIGN KEY ("hitl_request_id") REFERENCES "hitl_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

