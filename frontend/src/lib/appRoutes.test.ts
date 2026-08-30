import { describe, expect, it } from "vitest";
import { pathForSection, sectionFromPathname } from "./appRoutes";

describe("appRoutes", () => {
  it("uses the consumer-facing canonical paths", () => {
    expect(pathForSection("marketplace")).toBe("/discover");
    expect(pathForSection("vault")).toBe("/private-data");
    expect(pathForSection("clearance")).toBe("/approvals");
  });

  it("keeps legacy links working", () => {
    expect(sectionFromPathname("/marketplace", "home")).toBe("marketplace");
    expect(sectionFromPathname("/private-info", "home")).toBe("vault");
    expect(sectionFromPathname("/access", "home")).toBe("clearance");
  });

  it("recognizes detail and settings routes", () => {
    expect(sectionFromPathname("/discover/agents/example", "home")).toBe("marketplace");
    expect(sectionFromPathname("/agents/example/chat", "home")).toBe("helpers");
    expect(sectionFromPathname("/approvals/request-1", "home")).toBe("clearance");
    expect(sectionFromPathname("/settings/connections", "home")).toBe("settings");
  });
});
