import { describe, expect, it } from "vitest";
import { resolveRootRoute, safeReturnPath } from "./rootRoutes";

describe("root route ownership", () => {
  it("separates public, auth, and workspace routes", () => {
    expect(resolveRootRoute("/").surface).toBe("public");
    expect(resolveRootRoute("/agents/example").surface).toBe("public");
    expect(resolveRootRoute("/login").surface).toBe("auth");
    expect(resolveRootRoute("/app/private-data").surface).toBe("workspace");
  });

  it("maps legacy workspace routes", () => {
    expect(resolveRootRoute("/discover")).toEqual({ surface: "workspace", redirect: "/app/discover" });
    expect(resolveRootRoute("/settings")).toEqual({ surface: "workspace", redirect: "/app/settings" });
  });

  it("rejects external return paths", () => {
    expect(safeReturnPath("//evil.test/path")).toBe("/app");
    expect(safeReturnPath("https://evil.test/path")).toBe("/app");
    expect(safeReturnPath("/app/discover?intent=install")).toBe("/app/discover?intent=install");
  });
});
