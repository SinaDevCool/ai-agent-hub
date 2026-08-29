CREATE TABLE "financial_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "external_account_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "type" TEXT NOT NULL, "subtype" TEXT, "mask" TEXT, "currency" TEXT NOT NULL DEFAULT 'EUR',
  "current_balance" REAL, "available_balance" REAL, "sync_cursor" TEXT, "data_fresh_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL,
  CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "financial_accounts_user_id_provider_id_external_account_id_key" ON "financial_accounts"("user_id", "provider_id", "external_account_id");
CREATE INDEX "financial_accounts_user_id_updated_at_idx" ON "financial_accounts"("user_id", "updated_at");
CREATE TABLE "financial_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "financial_account_id" TEXT NOT NULL, "provider_transaction_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "merchant_name" TEXT, "amount" REAL NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "date" DATETIME NOT NULL,
  "pending" BOOLEAN NOT NULL DEFAULT false, "category_primary" TEXT, "category_detailed" TEXT, "removed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL,
  CONSTRAINT "financial_transactions_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "financial_transactions_user_id_provider_transaction_id_key" ON "financial_transactions"("user_id", "provider_transaction_id");
CREATE INDEX "financial_transactions_user_id_date_idx" ON "financial_transactions"("user_id", "date");
CREATE INDEX "financial_transactions_financial_account_id_date_idx" ON "financial_transactions"("financial_account_id", "date");
