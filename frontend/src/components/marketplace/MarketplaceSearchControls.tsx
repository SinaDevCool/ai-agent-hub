import { ChevronDown, Search } from "lucide-react";
import type { MarketplaceNeed } from "../../lib/marketplaceMatching";

type MarketplaceSearchControlsProps = {
  isMoreNeedsOpen: boolean;
  marketplaceCategory: string;
  marketplaceCategoryOptions: string[];
  marketplaceNeedOptions: MarketplaceNeed[];
  marketplaceSearch: string;
  setIsMoreNeedsOpen: (updater: (current: boolean) => boolean) => void;
  setMarketplaceCategory: (value: string) => void;
  setMarketplaceSearch: (value: string) => void;
  setMatcherNeedId: (value: string) => void;
};

export function MarketplaceSearchControls(props: MarketplaceSearchControlsProps) {
  const {
    isMoreNeedsOpen,
    marketplaceCategory,
    marketplaceCategoryOptions,
    marketplaceNeedOptions,
    marketplaceSearch,
    setIsMoreNeedsOpen,
    setMarketplaceCategory,
    setMarketplaceSearch,
    setMatcherNeedId
  } = props;
  const primaryNeedOptions = marketplaceNeedOptions.slice(0, 5);
  const secondaryNeedOptions = marketplaceNeedOptions.slice(5);

  return (
    <>
      <div className="marketplace-discovery-heading">
        <div>
          <strong>Find an agent</strong>
          <span>Search by task, or pick one common need.</span>
        </div>
      </div>

      <div className="marketplace-controls">
        <label>
          <span>Search Agents</span>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              aria-label="Search marketplace agents"
              autoComplete="off"
              name="marketplace-search"
              onChange={(event) => setMarketplaceSearch(event.currentTarget.value)}
              placeholder={"Try: apply for jobs\u2026"}
              value={marketplaceSearch}
            />
          </div>
        </label>
        <label className="marketplace-category-control">
          <span>Browse By Need</span>
          <select aria-label="Filter marketplace category" autoComplete="off" name="marketplace-category" onChange={(event) => setMarketplaceCategory(event.currentTarget.value)} value={marketplaceCategory}>
            {marketplaceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </div>

      <div className="marketplace-need-header">
        <strong>Popular Needs</strong>
        <span>{isMoreNeedsOpen ? "Showing all needs." : "Start broad, then refine."}</span>
      </div>

      <div className="marketplace-need-row" aria-label="Common agent needs">
        {[...primaryNeedOptions, ...(isMoreNeedsOpen ? secondaryNeedOptions : [])].map((need) => (
          <button
            className={marketplaceCategory === need.category && marketplaceSearch === need.query ? "selected" : ""}
            key={need.id}
            onClick={() => {
              setMatcherNeedId(need.id);
              setMarketplaceCategory(need.category);
              setMarketplaceSearch(need.query);
            }}
            type="button"
          >
            <strong>{need.title}</strong>
            <span>{need.detail}</span>
          </button>
        ))}
        {secondaryNeedOptions.length ? (
          <button className="marketplace-more-toggle" onClick={() => setIsMoreNeedsOpen((current) => !current)} type="button">
            <ChevronDown size={16} />
            <strong>{isMoreNeedsOpen ? "Fewer needs" : "More needs"}</strong>
            <span>{isMoreNeedsOpen ? "Show the main list" : "Health, work, and more"}</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
