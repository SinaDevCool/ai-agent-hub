CREATE TABLE "appointments" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "external_provider_id" TEXT NOT NULL,
  "provider_name" TEXT NOT NULL, "specialty" TEXT NOT NULL, "location" TEXT NOT NULL, "starts_at" DATETIME NOT NULL, "ends_at" DATETIME NOT NULL,
  "time_zone" TEXT NOT NULL DEFAULT 'UTC', "status" TEXT NOT NULL DEFAULT 'requested', "confirmation_code" TEXT,
  "calendar_event_json" TEXT NOT NULL DEFAULT '{}', "idempotency_key" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL,
  CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "appointments_user_id_idempotency_key_key" ON "appointments"("user_id", "idempotency_key");
CREATE INDEX "appointments_user_id_status_starts_at_idx" ON "appointments"("user_id", "status", "starts_at");
