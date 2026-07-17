import { describe, expect, it } from "vitest";
import { agentListEmptyState } from "./agentListEmptyState";

describe("agentListEmptyState", () => {
  it("prioritizes search recovery copy", () => {
    expect(agentListEmptyState({
      agentSearch: "arch",
      agentStatusFilter: "needs_access",
      hiddenTestAgentCount: 0,
      hideTestAgents: true
    })).toEqual({
      title: "No agents match that search",
      body: "Try a shorter name, task, or category.",
      actionLabel: "Clear search"
    });
  });

  it("treats an empty needs-access filter as good news", () => {
    expect(agentListEmptyState({
      agentSearch: "",
      agentStatusFilter: "needs_access",
      hiddenTestAgentCount: 0,
      hideTestAgents: true
    }).title).toBe("No agents need access");
  });

  it("uses plain language for approval filters", () => {
    expect(agentListEmptyState({
      agentSearch: "",
      agentStatusFilter: "needs_approval",
      hiddenTestAgentCount: 0,
      hideTestAgents: true
    }).body).toContain("Nothing needs your approval");
  });
});
