CREATE TYPE "BetaInviteStatus" AS ENUM ('pending', 'redeemed', 'revoked', 'expired', 'replaced');

ALTER TABLE "users"
  ADD COLUMN "beta_terms_accepted_at" TIMESTAMP(3),
  ADD COLUMN "onboarding_state" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "beta_invites" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "inviter_user_id" TEXT NOT NULL,
  "redeemed_by_user_id" TEXT,
  "status" "BetaInviteStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "redeemed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "replaced_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beta_feedback" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "expected_result" TEXT NOT NULL,
  "actual_result" TEXT NOT NULL,
  "consented_diagnostics" TEXT NOT NULL DEFAULT '{}',
  "contact_preference" TEXT NOT NULL DEFAULT 'none',
  "request_id" TEXT,
  "run_id" TEXT,
  "transaction_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "beta_invites_token_hash_key" ON "beta_invites"("token_hash");
CREATE INDEX "beta_invites_email_status_idx" ON "beta_invites"("email", "status");
CREATE INDEX "beta_invites_cohort_status_idx" ON "beta_invites"("cohort", "status");
CREATE INDEX "beta_invites_redeemed_by_user_id_status_idx" ON "beta_invites"("redeemed_by_user_id", "status");
CREATE INDEX "beta_feedback_status_severity_created_at_idx" ON "beta_feedback"("status", "severity", "created_at");
CREATE INDEX "beta_feedback_user_id_created_at_idx" ON "beta_feedback"("user_id", "created_at");
CREATE INDEX "beta_feedback_transaction_id_idx" ON "beta_feedback"("transaction_id");

ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "beta_feedback" ADD CONSTRAINT "beta_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "beta_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "beta_feedback" ENABLE ROW LEVEL SECURITY;
