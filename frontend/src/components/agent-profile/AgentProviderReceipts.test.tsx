import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityLog, ProviderReceipt } from "../../api/types";
import { friendlyDate, friendlyLogDetail, friendlyLogText } from "../../lib/appText";
import { AgentActivityTab } from "./AgentActivityTab";
import { ProviderReceiptCard } from "./AgentChatTab";

function makeReceipt(overrides: Partial<ProviderReceipt> = {}): ProviderReceipt {
  return {
    id: "receipt-1",
    agentId: "agent-1",
    agentName: "Health Notes Organizer",
    providerId: "health-workflow",
    providerLabel: "Health workflow",
    capabilityKey: "health.search_notes",
    capabilityLabel: "Search health notes",
    action: "search",
    status: "succeeded",
    approvalRequired: false,
    hitlRequestId: null,
    resultQuality: "complete",
    userMessage: "Found the saved notes this agent can use.",
    retryable: false,
    nextAction: null,
    itemCount: 2,
    externalRequestId: "request-1",
    endpointHost: "workflow.example.test",
    metadata: {},
    display: {
      title: "Health search completed",
      summary: "Found the saved notes this agent can use.",
      badge: "Done",
      category: "provider",
      agentName: "Health Notes Organizer",
      externalService: "Health workflow",
      itemCount: 2
    },
    createdAt: "2026-07-11T11:00:00.000Z",
    ...overrides
  };
}

function makeLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "log-1",
    actionType: "vault_read",
    status: "success",
    dataAccessed: "Medical History",
    hash: "hash",
    createdAt: "2026-07-11T10:00:00.000Z",
    ...overrides
  };
}

describe("agent provider receipt UI", () => {
  it("renders provider receipts in chat without exposing raw action metadata", () => {
    const markup = renderToStaticMarkup(<ProviderReceiptCard receipt={makeReceipt({ action: "raw_provider_action" })} />);

    expect(markup).toContain("Health search completed");
    expect(markup).toContain("Found the saved notes this agent can use.");
    expect(markup).toContain("Health workflow");
    expect(markup).not.toContain("raw_provider_action");
    expect(markup).not.toContain("[object Object]");
  });

  it("renders approval receipts as plain user decisions", () => {
    const markup = renderToStaticMarkup(
      <ProviderReceiptCard
        receipt={makeReceipt({
          action: "book_non_refundable_travel",
          status: "waiting_for_approval",
          nextAction: "approve_action",
          display: {
            title: "Book hotel needs your approval",
            summary: "Book hotel paused before travel booking. Nothing happens unless you allow it.",
            badge: "Waiting for you",
            category: "provider",
            agentName: "Health Notes Organizer",
            externalService: "Booking workflow",
            nextStep: "Review it and choose Allow once or Deny."
          }
        })}
      />
    );

    expect(markup).toContain("Book hotel needs your approval");
    expect(markup).toContain("Nothing happens unless you allow it.");
    expect(markup).toContain("Review it and choose Allow once or Deny.");
    expect(markup).not.toContain("book_non_refundable_travel");
    expect(markup).not.toContain("approve_action");
  });

  it("renders provider receipts alongside agent activity in newest-first order", () => {
    const markup = renderToStaticMarkup(
      <AgentActivityTab
        friendlyDate={friendlyDate}
        friendlyLogDetail={friendlyLogDetail}
        friendlyLogText={friendlyLogText}
        selectedAgentLogs={[makeLog()]}
        selectedAgentProviderReceipts={[makeReceipt()]}
      />
    );

    expect(markup).toContain("2 events");
    expect(markup.indexOf("Health search completed")).toBeLessThan(markup.indexOf("Medical History"));
    expect(markup).toContain("Every read, approval, and block appears here as a receipt.");
  });
});
