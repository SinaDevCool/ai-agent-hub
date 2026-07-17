import { describe, expect, it } from "vitest";
import { agentDisplayName } from "./agentDisplay";

describe("agent display labels", () => {
  it("normalizes old helper wording for the B2C agent experience", () => {
    expect(agentDisplayName("Daily Task Helper")).toBe("Daily Task Agent");
    expect(agentDisplayName("Find helpers for travel")).toBe("Find agents for travel");
    expect(agentDisplayName("My Helpers")).toBe("My Agents");
  });
});
