import { describe, expect, it } from "vitest";
import { pathForSection, sectionFromPathname } from "./appRoutes";

describe("appRoutes", () => {
  it("uses the consumer-facing canonical paths", () => {
    expect(pathForSection("marketplace")).toBe("/app/discover");
    expect(pathForSection("vault")).toBe("/app/private-data");
    expect(pathForSection("clearance")).toBe("/app/approvals");
  });

  it("keeps legacy links working", () => {
    expect(sectionFromPathname("/marketplace", "home")).toBe("marketplace");
    expect(sectionFromPathname("/private-info", "home")).toBe("vault");
    expect(sectionFromPathname("/access", "home")).toBe("clearance");
  });

  it("recognizes detail and settings routes", () => {
    expect(sectionFromPathname("/app/discover/agents/example", "home")).toBe("marketplace");
    expect(sectionFromPathname("/app/agents/example/chat", "home")).toBe("helpers");
    expect(sectionFromPathname("/app/approvals/request-1", "home")).toBe("clearance");
    expect(sectionFromPathname("/app/settings/connections", "home")).toBe("settings");
  });
});
