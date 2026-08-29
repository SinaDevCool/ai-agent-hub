CREATE TABLE "life_transactions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "capability_key" TEXT NOT NULL,
  "execution_level" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'draft',
  "region" TEXT,
  "provider_id" TEXT,
  "provider_candidates_json" TEXT NOT NULL DEFAULT '[]',
  "approval_required" BOOLEAN NOT NULL DEFAULT false,
  "hitl_request_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "input_json" TEXT NOT NULL DEFAULT '{}',
  "result_json" TEXT NOT NULL DEFAULT '{}',
  "external_reference" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "life_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "life_transactions_user_id_idempotency_key_key" ON "life_transactions"("user_id", "idempotency_key");
CREATE INDEX "life_transactions_user_id_state_created_at_idx" ON "life_transactions"("user_id", "state", "created_at");
CREATE INDEX "life_transactions_provider_id_state_idx" ON "life_transactions"("provider_id", "state");
ALTER TABLE "life_transactions" ADD CONSTRAINT "life_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
