DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('user', 'moderator', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'user';
