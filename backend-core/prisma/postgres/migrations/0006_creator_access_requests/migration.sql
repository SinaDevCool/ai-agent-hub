DO $$ BEGIN
  CREATE TYPE "CreatorAccessRequestStatus" AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "creator_access_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "CreatorAccessRequestStatus" NOT NULL DEFAULT 'pending',
  "reason" TEXT NOT NULL,
  "review_note" TEXT NOT NULL DEFAULT '',
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creator_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "creator_access_requests_user_id_status_idx" ON "creator_access_requests"("user_id", "status");
CREATE INDEX IF NOT EXISTS "creator_access_requests_status_created_at_idx" ON "creator_access_requests"("status", "created_at");

DO $$ BEGIN
  ALTER TABLE "creator_access_requests"
    ADD CONSTRAINT "creator_access_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "creator_access_requests"
    ADD CONSTRAINT "creator_access_requests_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
