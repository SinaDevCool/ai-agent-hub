-- CreateTable
CREATE TABLE "provider_receipts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "tool_run_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "provider_label" TEXT NOT NULL,
    "capability_key" TEXT NOT NULL,
    "capability_label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "hitl_request_id" TEXT,
    "result_quality" TEXT,
    "user_message" TEXT NOT NULL,
    "technical_message" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "next_action" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "external_request_id" TEXT,
    "endpoint_host" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_receipts_user_id_created_at_idx" ON "provider_receipts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_receipts_user_id_agent_id_created_at_idx" ON "provider_receipts"("user_id", "agent_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_receipts_user_id_capability_key_created_at_idx" ON "provider_receipts"("user_id", "capability_key", "created_at");

-- CreateIndex
CREATE INDEX "provider_receipts_tool_run_id_idx" ON "provider_receipts"("tool_run_id");

-- AddForeignKey
ALTER TABLE "provider_receipts" ADD CONSTRAINT "provider_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_receipts" ADD CONSTRAINT "provider_receipts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_receipts" ADD CONSTRAINT "provider_receipts_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_receipts" ADD CONSTRAINT "provider_receipts_tool_run_id_fkey" FOREIGN KEY ("tool_run_id") REFERENCES "tool_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
