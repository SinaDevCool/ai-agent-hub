import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../api/types";
import { formatLocalAiError, interpretPromptLocally, interpretPromptWithBrowserRules } from "./localAiBridge";

afterEach(() => vi.unstubAllGlobals());

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

const catalogCases = [
  ["Personal Administration Assistant", "Summarize important messages and deadlines", ["vault.search", "email.search", "email.draft_reply", "calendar.find_free_time", "workflow.run", "action.execute"]],
  ["Trip Companion", "Plan a weekend trip using my preferences", ["vault.search", "workflow.run", "action.execute"]],
  ["Budget Guard", "Find the spending rule I should follow", ["vault.search", "workflow.run", "action.execute"]],
  ["Daily Task Helper", "Make a plan for my errands today", ["vault.search", "workflow.run", "action.execute"]],
  ["Shopping Scout", "Help me choose without buying anything", ["vault.search", "workflow.run", "action.execute"]],
  ["Health Notes Organizer", "Find allergy details in my private notes", ["vault.search", "workflow.run"]],
  ["Job Application Coach", "Draft a cover letter using my career profile", ["vault.search", "email.search", "email.draft_reply"]],
  ["Inbox Follow-Up Helper", "Draft a polite follow-up email to Alex saying thank you", ["vault.search", "email.search", "email.draft_reply", "calendar.find_free_time"]],
  ["Home Maintenance Helper", "Find the last note about this appliance", ["vault.search", "workflow.run", "action.execute"]],
  ["Private Info Librarian", "Find what private info I have saved", ["vault.search"]],
  ["Appointment Coordinator", "Find a dentist in Berlin", ["vault.search", "workflow.run", "action.execute"]],
  ["Leisure Concierge", "Show events this weekend", ["vault.search", "workflow.run", "action.execute"]],
  ["Smart Home and Energy Assistant", "Explain yesterday's energy use", ["vault.search", "workflow.run", "action.execute"]]
] as const;

describe("browser-local catalog compatibility", () => {
  it.each(catalogCases)("creates a portable plan for %s", (name, prompt, tools) => {
    const agent = {
      ...appointmentAgent,
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      capabilityManifest: { tools: [...tools], capabilities: [], requestedSchemas: [], highRiskActions: [] }
    } as Agent;
    const result = interpretPromptWithBrowserRules({ prompt, agent });

    expect(result.interpretation.arguments.task).toBe(prompt);
    expect(result.interpretation.requiresClarification).toBe(false);
    if (result.interpretation.proposedTool) expect(tools).toContain(result.interpretation.proposedTool);
  });

  it("passes every catalog agent's identity and scope to desktop inference", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "local-first", setItem: () => undefined },
      __TAURI_INTERNALS__: {
        invoke: async (_command: string, args: { request: Record<string, unknown> }) => {
          requests.push(args.request);
          return {
            interpretation: { intent: "search", proposedTool: null, arguments: {}, missingFields: [], requiresClarification: false, confidence: 1, language: "en", riskHints: [] },
            clientRuntime: { kind: "desktop-local", modelId: "ministral-3-3b-q4", modelVersion: "2512", rulesVersion: "runtime-rules-v1" }
          };
        }
      }
    });

    for (const [name, prompt, tools] of catalogCases) {
      const agent = {
        ...appointmentAgent,
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        capabilityManifest: { tools: [...tools], capabilities: [], requestedSchemas: [], highRiskActions: [], description: `${name} catalog scope` }
      } as Agent;
      await interpretPromptLocally({ prompt, agent });
    }

    expect(requests).toHaveLength(catalogCases.length);
    requests.forEach((request, index) => {
      expect(request.agentName).toBe(catalogCases[index][0]);
      expect(request.agentDescription).toBe(`${catalogCases[index][0]} catalog scope`);
      expect(request.tools).toEqual([...catalogCases[index][2]]);
    });
  });

  it.each([
    ["Search my inbox for the invoice", "email_search", "email.search", "query"],
    ["Draft an email to Alex saying thank you", "email_draft", "email.draft_reply", "body"],
    ["When am I free in the next 3 days?", "calendar_free_time", "calendar.find_free_time", "days"],
    ["Find the proposal document in Drive", "document_search", "drive.search", "query"]
  ] as const)("maps %s to declared domain tooling", (prompt, intent, tool, argument) => {
    const agent = {
      ...appointmentAgent,
      capabilityManifest: { tools: ["vault.search", "email.search", "email.draft_reply", "calendar.find_free_time", "drive.search"], capabilities: [], requestedSchemas: [], highRiskActions: [] }
    } as Agent;
    const result = interpretPromptWithBrowserRules({ prompt, agent });
    expect(result.interpretation.intent).toBe(intent);
    expect(result.interpretation.proposedTool).toBe(tool);
    expect(result.interpretation.arguments[argument]).toBeTruthy();
  });
});
