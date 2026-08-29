ALTER TYPE "ConnectedAccountStatus" ADD VALUE IF NOT EXISTS 'refreshing';

ALTER TABLE "connected_accounts"
  ADD COLUMN "refresh_started_at" TIMESTAMP(3),
  ADD COLUMN "last_refresh_at" TIMESTAMP(3);

CREATE TABLE "oauth_authorizations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "encrypted_code_verifier" TEXT NOT NULL,
  "requested_scopes" TEXT NOT NULL DEFAULT '[]',
  "return_path" TEXT NOT NULL DEFAULT '/settings',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_authorizations_state_hash_key" ON "oauth_authorizations"("state_hash");
CREATE INDEX "oauth_authorizations_user_id_provider_expires_at_idx" ON "oauth_authorizations"("user_id", "provider", "expires_at");
ALTER TABLE "oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_authorizations" ENABLE ROW LEVEL SECURITY;
