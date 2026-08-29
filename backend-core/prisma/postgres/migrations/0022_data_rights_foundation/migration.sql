CREATE TYPE "DataRightsRequestType" AS ENUM ('export', 'deletion');
CREATE TYPE "DataRightsRequestStatus" AS ENUM ('pending', 'scheduled', 'processing', 'completed', 'cancelled', 'failed');

CREATE TABLE "data_rights_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_type" "DataRightsRequestType" NOT NULL,
  "status" "DataRightsRequestStatus" NOT NULL DEFAULT 'pending',
  "execute_after" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "artifact_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_rights_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_rights_requests_user_id_request_type_status_idx" ON "data_rights_requests"("user_id", "request_type", "status");
CREATE INDEX "data_rights_requests_status_execute_after_idx" ON "data_rights_requests"("status", "execute_after");
CREATE UNIQUE INDEX "data_rights_requests_one_active_per_type_idx" ON "data_rights_requests"("user_id", "request_type") WHERE "status" IN ('pending', 'scheduled', 'processing');
ALTER TABLE "data_rights_requests" ADD CONSTRAINT "data_rights_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_rights_requests" ENABLE ROW LEVEL SECURITY;
