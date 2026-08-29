import { describe, expect, it } from "vitest";
import type { Agent } from "../api/types";
import { agentDisplayName, promptSuggestions } from "./agentDisplay";

function appointmentAgent(): Agent {
  return {
    id: "appointment-agent",
    name: "Appointment Coordinator",
    category: "Wellness",
    apiProtocol: "MCP",
    trustScore: 90,
    capabilityManifest: {
      tools: ["email.search", "workflow.run", "action.execute"],
      capabilities: ["appointments.provider.search", "appointments.availability.search", "appointments.booking.manage"],
      requestedSchemas: ["Medical History", "Personal Identity Profile"],
      highRiskActions: ["book_medical_appointment"]
    },
    permissions: [],
    connections: []
  };
}

describe("agent display labels", () => {
  it("normalizes old helper wording for the B2C agent experience", () => {
    expect(agentDisplayName("Daily Task Helper")).toBe("Daily Task Agent");
    expect(agentDisplayName("Find helpers for travel")).toBe("Find agents for travel");
    expect(agentDisplayName("My Helpers")).toBe("My Agents");
  });
});

describe("promptSuggestions", () => {
  it("prioritizes appointment workflows over generic email prompts", () => {
    const prompts = promptSuggestions(appointmentAgent());

    expect(prompts.map((item) => item.label)).toEqual([
      "Find a provider",
      "Check availability",
      "Manage safely"
    ]);
    expect(prompts[1]?.prompt).toContain("sandbox-clinic");
    expect(prompts[2]?.tone).toBe("approval");
  });
});
