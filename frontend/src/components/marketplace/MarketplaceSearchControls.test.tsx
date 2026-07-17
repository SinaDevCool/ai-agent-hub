import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceNeed } from "../../lib/marketplaceMatching";
import { MarketplaceSearchControls } from "./MarketplaceSearchControls";

const needs: MarketplaceNeed[] = [
  { id: "travel", title: "Travel", detail: "Trips, bookings, loyalty", category: "Travel", query: "travel" },
  { id: "money", title: "Money", detail: "Budget, cards, payments", category: "Money", query: "money" },
  { id: "daily", title: "Daily Tasks", detail: "Reminders, planning, errands", category: "Daily Tasks", query: "daily tasks" },
  { id: "apps", title: "Applications", detail: "Jobs, school, forms", category: "Applications", query: "applications" },
  { id: "life", title: "Life Admin", detail: "Family, appointments, paperwork", category: "Life Admin", query: "life admin" },
  { id: "health", title: "Health", detail: "Notes, medicine, care", category: "Health", query: "health" }
];

function renderControls(isMoreNeedsOpen = false) {
  return renderToStaticMarkup(
    <MarketplaceSearchControls
      isMoreNeedsOpen={isMoreNeedsOpen}
      marketplaceCategory="Travel"
      marketplaceCategoryOptions={["All", "Travel", "Money"]}
      marketplaceNeedOptions={needs}
      marketplaceSearch="travel"
      setIsMoreNeedsOpen={vi.fn()}
      setMarketplaceCategory={vi.fn()}
      setMarketplaceSearch={vi.fn()}
      setMatcherNeedId={vi.fn()}
    />
  );
}

describe("MarketplaceSearchControls", () => {
  it("uses agent-marketplace language without old helper wording", () => {
    const markup = renderControls();

    expect(markup).toContain("Find an agent");
    expect(markup).toContain("Search Agents");
    expect(markup).toContain("Popular Needs");
    expect(markup).toContain("More needs");
    expect(markup).not.toContain("Helper");
    expect(markup).not.toContain("helper");
  });

  it("can render all needs in the expanded mobile-friendly flow", () => {
    const markup = renderControls(true);

    expect(markup).toContain("Health");
    expect(markup).toContain("Fewer needs");
    expect(markup).toContain("Showing all needs.");
  });
});
