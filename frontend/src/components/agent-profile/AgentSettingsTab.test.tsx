import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../api/types";
import { AgentSettingsTab } from "./AgentSettingsTab";

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
    requestedSchemas: ["Medical History"],
    highRiskActions: ["share_medical_record"],
    tools: ["search_notes"]
  },
  permissions: [],
  connections: []
};

function renderSettings(toolResult = "") {
  return renderToStaticMarkup(
    <AgentSettingsTab
      externalHost={null}
      friendlyTrustLabel={() => "Very trusted"}
      removeAgentFromProfile={vi.fn()}
      revokeSelectedAgentAccess={vi.fn()}
      runVaultSearch={vi.fn()}
      selectedAgent={selectedAgent}
      selectedIsExternal={false}
      setAgentProfileTab={vi.fn()}
      sourceLabel="Built in AI Agent Hub"
      toolResult={toolResult}
      triggerHighRiskAction={vi.fn()}
      verificationLabel="Local safety rules"
    />
  );
}

describe("AgentSettingsTab", () => {
  it("keeps the settings actions clear and centered on agent management", () => {
    const markup = renderSettings();

    expect(markup).toContain("Built in AI Agent Hub");
    expect(markup).toContain("Local safety rules");
    expect(markup).toContain("Can only use what you allow");
    expect(markup).toContain("Open chat");
    expect(markup).toContain("Search personal info");
    expect(markup).toContain("Try approval flow");
    expect(markup).toContain("Remove saved info access");
    expect(markup).toContain("Remove agent");
    expect(markup).not.toContain("helper");
    expect(markup).not.toContain("â");
  });

  it("shows friendly action feedback without replacing the main controls", () => {
    const markup = renderSettings("Search finished. Check Activity for the receipt.");

    expect(markup).toContain("Search finished. Check Activity for the receipt.");
    expect(markup).toContain("Search personal info");
  });
});
