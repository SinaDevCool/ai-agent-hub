-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('active', 'refreshing', 'expired', 'reconnect_required', 'revoked', 'error', 'disabled');

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_kind" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'active',
    "display_name" TEXT NOT NULL DEFAULT '',
    "encrypted_credentials" TEXT NOT NULL,
    "credential_fingerprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "refresh_after" TIMESTAMP(3),
    "external_account_id" TEXT,
    "external_account_label" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "last_validated_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_connections_user_id_provider_id_idx" ON "provider_connections"("user_id", "provider_id");

-- CreateIndex
CREATE INDEX "provider_connections_user_id_status_idx" ON "provider_connections"("user_id", "status");

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
