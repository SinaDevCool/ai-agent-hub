CREATE TABLE "shopping_lists" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "items_json" TEXT NOT NULL DEFAULT '[]',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "shopping_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shopping_lists_user_id_name_key" ON "shopping_lists"("user_id", "name");
CREATE INDEX "shopping_lists_user_id_updated_at_idx" ON "shopping_lists"("user_id", "updated_at");
