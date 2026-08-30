import { describe, expect, it } from "vitest";
import { formatLocalAiError } from "./localAiBridge";

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
