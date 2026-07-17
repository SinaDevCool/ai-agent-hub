import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("shows friendly failure copy and keeps actions available", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog
        confirmation={{
          title: "Remove all agent access?",
          message: "Agents will stop using saved info until you allow access again.",
          confirmLabel: "Remove all access",
          tone: "danger"
        }}
        error="We could not finish that request. Please try again in a moment."
        isConfirming={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(markup).toContain("Remove all agent access?");
    expect(markup).toContain("Agents will stop using saved info until you allow access again.");
    expect(markup).toContain("We could not finish that request. Please try again in a moment.");
    expect(markup).toContain("Remove all access");
    expect(markup).toContain("Cancel");
  });

  it("uses a clear working label while confirming", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog
        confirmation={{
          title: "Remove this agent?",
          message: "The agent will be removed from your profile.",
          confirmLabel: "Remove agent"
        }}
        isConfirming={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(markup).toContain("Working…");
    expect(markup).not.toContain("Working...");
    expect(markup).not.toContain("WorkingÃ¢");
  });
});
