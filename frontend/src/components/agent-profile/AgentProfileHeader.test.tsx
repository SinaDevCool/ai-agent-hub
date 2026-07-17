import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../api/types";
import { AgentProfileHeader } from "./AgentProfileHeader";

const selectedAgent: Agent = {
  id: "agent-health",
  name: "Health Notes Organizer",
  category: "Health",
  apiProtocol: "MCP",
  trustScore: 82,
  capabilityManifest: {
    protocol: "MCP",
    sourceType: "native",
    verificationStatus: "verified",
    description: "Organizes health notes while keeping sensitive details tightly controlled.",
    requestedSchemas: ["Medical History"],
    highRiskActions: ["share_medical_record"],
    tools: ["search_notes"]
  },
  permissions: [],
  connections: []
};

describe("AgentProfileHeader", () => {
  it("keeps the mobile header focused on one readable next action", () => {
    const markup = renderToStaticMarkup(
      <AgentProfileHeader
        agentProfileTab="chat"
        readiness={{ detail: "Needs access", label: "Needs access", tone: "amber" }}
        selectedAgent={selectedAgent}
        selectedAgentToolsLabel="search notes"
        selectedReadableInfoLabel="Medical History"
        selectedRiskyActionsLabel="share medical record"
        setAgentProfileTab={vi.fn()}
      />
    );

    expect(markup).toContain("Allow saved info before this agent can answer well.");
    expect(markup).toContain("You control what this agent can read or do.");
    expect(markup).toContain("Review access");
    expect(markup).not.toContain("Uses saved info only after you allow it");
  });
});
