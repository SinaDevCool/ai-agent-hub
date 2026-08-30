import { describe, expect, it } from "vitest";
import type { Agent } from "../api/types";
import { formatLocalAiError, interpretPromptWithBrowserRules } from "./localAiBridge";

describe("formatLocalAiError", () => {
  it("preserves native Tauri string errors", () => {
    expect(formatLocalAiError("Local model did not become ready.")).toBe("Local model did not become ready.");
  });

  it("preserves JavaScript errors and structured messages", () => {
    expect(formatLocalAiError(new Error("Model request timed out."))).toBe("Model request timed out.");
    expect(formatLocalAiError({ message: "Checksum failed." })).toBe("Checksum failed.");
  });

  it("uses an actionable fallback for unknown failures", () => {
    expect(formatLocalAiError(null)).toContain("Restart the app");
  });
});

const appointmentAgent = {
  id: "appointment-agent",
  name: "Appointment Coordinator",
  category: "Wellness",
  apiProtocol: "MCP",
  trustScore: 90,
  capabilityManifest: {
    tools: ["vault.search", "workflow.run", "action.execute"],
    capabilities: ["appointments.provider.search", "appointments.availability.search", "appointments.booking.manage"],
    requestedSchemas: ["Medical History"],
    highRiskActions: ["book_medical_appointment", "cancel_medical_appointment"]
  },
  permissions: [],
  connections: []
} as Agent;

describe("browser-local Appointment Coordinator interpretation", () => {
  it("produces a complete read-only availability plan without booking", () => {
    const result = interpretPromptWithBrowserRules({
      prompt: "Find available appointment slots for sandbox-clinic from 2030-04-12 to 2030-04-13. Do not book anything.",
      agent: appointmentAgent
    });

    expect(result.interpretation).toMatchObject({
      intent: "search",
      proposedTool: "workflow.run",
      requiresClarification: false,
      arguments: {
        requestType: "appointment availability",
        providerId: "sandbox-clinic",
        startDate: "2030-04-12",
        endDate: "2030-04-13"
      }
    });
    expect(result.clientRuntime.modelId).toBe("browser-rules");
    expect(result.interpretation.riskHints).toEqual([]);
  });

  it("keeps booking behind the action and approval path", () => {
    const result = interpretPromptWithBrowserRules({
      prompt: "Book the sandbox-clinic appointment after I approve it.",
      agent: appointmentAgent
    });
    expect(result.interpretation.intent).toBe("action");
    expect(result.interpretation.proposedTool).toBe("workflow.run");
    expect(result.interpretation.riskHints).toContain("backend_policy_required");
  });
});
