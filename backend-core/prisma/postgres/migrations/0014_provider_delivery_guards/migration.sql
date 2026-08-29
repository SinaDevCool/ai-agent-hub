CREATE TABLE "provider_transaction_attempts" (
  "id" TEXT NOT NULL,
  "life_transaction_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "request_json" TEXT NOT NULL DEFAULT '{}',
  "response_json" TEXT NOT NULL DEFAULT '{}',
  "external_reference" TEXT,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "provider_transaction_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_transaction_attempts_life_transaction_id_attempt_number_key" ON "provider_transaction_attempts"("life_transaction_id", "attempt_number");
CREATE INDEX "provider_transaction_attempts_provider_id_status_started_at_idx" ON "provider_transaction_attempts"("provider_id", "status", "started_at");
ALTER TABLE "provider_transaction_attempts" ADD CONSTRAINT "provider_transaction_attempts_life_transaction_id_fkey" FOREIGN KEY ("life_transaction_id") REFERENCES "life_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "provider_webhook_events" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload_json" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'received',
  "failure_reason" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_webhook_events_provider_id_external_event_id_key" ON "provider_webhook_events"("provider_id", "external_event_id");
CREATE INDEX "provider_webhook_events_status_received_at_idx" ON "provider_webhook_events"("status", "received_at");

CREATE TABLE "provider_idempotency_records" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "response_json" TEXT NOT NULL DEFAULT '{}',
  "external_reference" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_idempotency_records_user_id_provider_id_idempotency_key_key" ON "provider_idempotency_records"("user_id", "provider_id", "idempotency_key");
CREATE INDEX "provider_idempotency_records_expires_at_idx" ON "provider_idempotency_records"("expires_at");
