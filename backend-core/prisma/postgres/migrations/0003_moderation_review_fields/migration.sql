ALTER TABLE "agent_definitions" ADD COLUMN IF NOT EXISTS "moderation_note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "agent_definitions" ADD COLUMN IF NOT EXISTS "submitted_for_review_at" TIMESTAMP(3);
ALTER TABLE "agent_definitions" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "agent_definitions" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" TEXT;
