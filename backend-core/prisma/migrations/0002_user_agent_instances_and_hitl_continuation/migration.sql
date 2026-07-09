DROP INDEX IF EXISTS "agents_name_key";

CREATE INDEX IF NOT EXISTS "agents_name_idx" ON "agents"("name");

ALTER TABLE "hitl_requests" ADD COLUMN "continued_at" DATETIME;
