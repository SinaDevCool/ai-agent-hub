import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { friendlyAppError, friendlyResult, providerReceiptDetail, runtimeSummary } from "./appText";

describe("friendly app text", () => {
  it("maps missing private-info permission to plain user language", () => {
    expect(friendlyResult({ status: "blocked", reason: "missing_private_info_permission" }))
      .toBe("This agent needs access before it can use that private info.");
  });

  it("maps blocked policy results to safety-rule language", () => {
    expect(friendlyResult({ status: "blocked", reason: "blocked_by_policy" }))
      .toBe("Nothing continued because this is blocked by your safety rules.");
  });

  it("keeps approval waits clear and non-technical", () => {
    expect(friendlyResult({ status: "awaiting_human_approval", actionName: "book_non_refundable_travel" }))
      .toBe("Waiting for you. Nothing continues unless you allow it.");
  });

  it("hides raw provider and action tokens in generic result text", () => {
    expect(friendlyResult({ status: "provider_error" }))
      .toBe("We could not finish that request. Please try again.");
    expect(friendlyResult({ status: "blocked", reason: "provider_error" }))
      .toBe("Nothing continued. Review the agent access and try again.");
    expect(friendlyResult({ status: "blocked", reason: "book_non_refundable_travel" }))
      .toBe("Nothing continued before book non-refundable travel.");
  });

  it("hides raw blocked reasons in runtime summaries", () => {
    expect(runtimeSummary({
      status: "blocked",
      intent: "action",
      reply: "provider_error",
      reason: "provider_error"
    })).toBe("Nothing continued. Review the agent access and try again.");
  });

  it("hides raw provider receipt fallback text", () => {
    expect(providerReceiptDetail({
      id: "receipt-1",
      agentId: "agent-1",
      agentName: "Agent",
      providerId: "workflow",
      providerLabel: "Workflow",
      capabilityKey: "travel.book_hotel",
      capabilityLabel: "Book hotel",
      action: "book_non_refundable_travel",
      status: "blocked",
      approvalRequired: false,
      hitlRequestId: null,
      resultQuality: null,
      userMessage: "provider_error: workflow failed with internal server error",
      retryable: false,
      nextAction: "connect_account",
      itemCount: 0,
      externalRequestId: null,
      endpointHost: null,
      metadata: {},
      createdAt: new Date().toISOString()
    })).toBe("This provider task could not finish. Next: Connect the provider, then try again.");
  });

  it("maps backend and network errors to B2C retry messages", () => {
    expect(friendlyAppError(new ApiError({
      message: "POST request failed with status 500",
      method: "POST",
      path: "/api/me/agents/agent-1/run",
      status: 500
    }))).toBe("We could not finish that request. Please try again in a moment.");

    expect(friendlyAppError(new ApiError({
      message: "Internal server error",
      method: "POST",
      path: "/api/permissions/clearance",
      status: 500
    }))).toBe("We could not finish that request. Please try again in a moment.");

    expect(friendlyAppError(new Error("Failed to fetch")))
      .toBe("Could not reach your agent service. Check the connection, wait a few seconds, and try again.");
  });
});
