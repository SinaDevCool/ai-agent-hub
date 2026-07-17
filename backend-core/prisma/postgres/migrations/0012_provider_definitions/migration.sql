-- CreateTable
CREATE TABLE "provider_definitions" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "capabilities_json" TEXT NOT NULL DEFAULT '[]',
    "actions_json" TEXT NOT NULL DEFAULT '[]',
    "action_schemas_json" TEXT NOT NULL DEFAULT '[]',
    "runtime_config_json" TEXT NOT NULL DEFAULT '{}',
    "credential_type" TEXT NOT NULL DEFAULT 'none',
    "credential_fields_json" TEXT NOT NULL DEFAULT '[]',
    "oauth_config_json" TEXT NOT NULL DEFAULT '{}',
    "auth_type" TEXT NOT NULL DEFAULT 'none',
    "risk_level" TEXT NOT NULL DEFAULT 'medium',
    "requires_connected_account" BOOLEAN NOT NULL DEFAULT false,
    "supports_health_check" BOOLEAN NOT NULL DEFAULT false,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "health_failure_code" TEXT,
    "health_failure_message" TEXT,
    "health_checked_at" TIMESTAMP(3),
    "health_last_success_at" TIMESTAMP(3),
    "health_last_failure_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_definitions_provider_id_key" ON "provider_definitions"("provider_id");

-- CreateIndex
CREATE INDEX "provider_definitions_status_kind_idx" ON "provider_definitions"("status", "kind");

-- CreateIndex
CREATE INDEX "provider_definitions_health_status_health_checked_at_idx" ON "provider_definitions"("health_status", "health_checked_at");

-- CreateIndex
CREATE INDEX "provider_definitions_created_by_user_id_status_idx" ON "provider_definitions"("created_by_user_id", "status");

-- AddForeignKey
ALTER TABLE "provider_definitions" ADD CONSTRAINT "provider_definitions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
