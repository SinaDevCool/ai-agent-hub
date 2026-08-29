ALTER TABLE "data_rights_requests" ADD COLUMN "artifact_expires_at" TIMESTAMP(3);
CREATE INDEX "data_rights_requests_artifact_expires_at_idx" ON "data_rights_requests"("artifact_expires_at");
