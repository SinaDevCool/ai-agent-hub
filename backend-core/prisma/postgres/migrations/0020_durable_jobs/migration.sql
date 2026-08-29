CREATE TYPE "DurableJobStatus" AS ENUM (
  'queued',
  'leased',
  'retry_scheduled',
  'reconciliation_required',
  'succeeded',
  'cancelled',
  'dead_letter'
);

CREATE TABLE "durable_jobs" (
  "id" TEXT NOT NULL,
  "job_type" TEXT NOT NULL,
  "job_version" INTEGER NOT NULL DEFAULT 1,
  "user_id" TEXT,
  "aggregate_type" TEXT,
  "aggregate_id" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" "DurableJobStatus" NOT NULL DEFAULT 'queued',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3),
  "last_error_classification" TEXT,
  "last_error_message" TEXT,
  "correlation_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "dead_lettered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "durable_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "durable_jobs_dedupe_key_key" ON "durable_jobs"("dedupe_key");
CREATE INDEX "durable_jobs_status_scheduled_at_priority_idx" ON "durable_jobs"("status", "scheduled_at", "priority");
CREATE INDEX "durable_jobs_lease_expires_at_status_idx" ON "durable_jobs"("lease_expires_at", "status");
CREATE INDEX "durable_jobs_user_id_created_at_idx" ON "durable_jobs"("user_id", "created_at");
CREATE INDEX "durable_jobs_aggregate_type_aggregate_id_idx" ON "durable_jobs"("aggregate_type", "aggregate_id");

ALTER TABLE "durable_jobs"
  ADD CONSTRAINT "durable_jobs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "durable_jobs" ENABLE ROW LEVEL SECURITY;
