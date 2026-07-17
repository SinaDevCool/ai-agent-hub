import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityLog, ProviderReceipt } from "../api/types";
import { friendlyDate, friendlyLogDetail, friendlyLogText, friendlyNotificationText } from "../lib/appText";
import { buildReceiptEvents, filterReceiptEvents, ReceiptsPanel } from "./ReceiptsPanel";

function makeLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "log-1",
    actionType: "vault_read",
    status: "success",
    dataAccessed: "Travel Preferences",
    hash: "hash",
    createdAt: "2026-07-11T10:00:00.000Z",
    ...overrides
  };
}

function makeReceipt(overrides: Partial<ProviderReceipt> = {}): ProviderReceipt {
  return {
    id: "receipt-1",
    agentId: "agent-1",
    agentName: "Trip Companion",
    providerId: "booking-workflow",
    providerLabel: "Booking workflow",
    capabilityKey: "travel.search_hotels",
    capabilityLabel: "Find hotels",
    action: "search",
    status: "succeeded",
    approvalRequired: false,
    hitlRequestId: null,
    resultQuality: "complete",
    userMessage: "Found three hotel options near transit.",
    retryable: false,
    nextAction: "review_options",
    itemCount: 3,
    externalRequestId: "request-1",
    endpointHost: "booking.example.test",
    metadata: { query: "Lisbon" },
    display: {
      title: "Find hotels completed",
      summary: "Found three hotel options near transit.",
      badge: "Done",
      category: "provider",
      agentName: "Trip Companion",
      externalService: "Booking workflow",
      nextStep: "review_options",
      itemCount: 3
    },
    createdAt: "2026-07-11T11:00:00.000Z",
    ...overrides
  };
}

describe("ReceiptsPanel provider receipt events", () => {
  it("merges provider receipts with activity logs newest first", () => {
    const events = buildReceiptEvents([
      makeLog({ id: "older-log", createdAt: "2026-07-11T09:00:00.000Z" })
    ], [
      makeReceipt({ id: "newer-receipt", createdAt: "2026-07-11T12:00:00.000Z" })
    ]);

    expect(events.map((event) => event.id)).toEqual(["newer-receipt", "older-log"]);
  });

  it("filters external, waiting, and blocked provider receipts", () => {
    const events = buildReceiptEvents([
      makeLog({ id: "saved-info", status: "success" })
    ], [
      makeReceipt({ id: "done-provider", status: "succeeded" }),
      makeReceipt({ id: "waiting-provider", status: "waiting_for_approval" }),
      makeReceipt({ id: "blocked-provider", status: "blocked" })
    ]);

    expect(filterReceiptEvents(events, "external").map((event) => event.id)).toEqual([
      "done-provider",
      "waiting-provider",
      "blocked-provider"
    ]);
    expect(filterReceiptEvents(events, "approval").map((event) => event.id)).toEqual(["waiting-provider"]);
    expect(filterReceiptEvents(events, "blocked").map((event) => event.id)).toEqual(["blocked-provider"]);
  });

  it("renders provider receipt text and external filter without raw technical output", () => {
    const markup = renderToStaticMarkup(
      <ReceiptsPanel
        className="panel"
        friendlyDate={friendlyDate}
        friendlyLogDetail={friendlyLogDetail}
        friendlyLogText={friendlyLogText}
        friendlyNotificationText={friendlyNotificationText}
        logsCount={2}
        onUseAgent={() => undefined}
        providerReceipts={[makeReceipt({
          action: "book_non_refundable_travel",
          metadata: { token: "hidden-secret", query: "Lisbon" }
        })]}
        recentLogs={[makeLog()]}
      />
    );

    expect(markup).toContain("Connected apps");
    expect(markup).toContain("Find hotels completed");
    expect(markup).toContain("Trip Companion via Booking workflow");
    expect(markup).not.toContain("book_non_refundable_travel");
    expect(markup).not.toContain("hidden-secret");
    expect(markup).not.toContain("[object Object]");
  });
});
