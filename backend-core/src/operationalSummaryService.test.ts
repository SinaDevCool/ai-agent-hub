import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOperationalSignals } from "./services/operationalSummaryService.js";

test("operational signals are healthy below alert thresholds", () => {
  assert.equal(evaluateOperationalSignals({ deadLetterJobs: 0, reconciliationJobs: 0, oldestPendingMinutes: null, providerFailures15m: 0, failedPrivacyRequests: 0, appointmentWebhookPending: 0, appointmentWebhookDeadLetter: 0 }).status, "healthy");
});

test("privacy failures and dead letters produce a critical state", () => {
  const result = evaluateOperationalSignals({ deadLetterJobs: 1, reconciliationJobs: 0, oldestPendingMinutes: null, providerFailures15m: 0, failedPrivacyRequests: 1, appointmentWebhookPending: 0, appointmentWebhookDeadLetter: 1 });
  assert.equal(result.status, "critical");
  assert.deepEqual(result.alerts.map((item) => item.key), ["dead_letter_jobs", "failed_privacy_requests"]);
});
