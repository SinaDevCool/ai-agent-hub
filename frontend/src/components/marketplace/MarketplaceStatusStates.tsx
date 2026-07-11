import { Pencil } from "lucide-react";

type MarketplaceStatusStatesProps = {
  canUseCreatorTools: boolean;
  formatError: (error: unknown) => string;
  hasInstallableMarketplaceAgent: boolean;
  installedMarketplaceMatchesLength: number;
  isRefreshing: boolean;
  marketplaceAgentCount: number;
  marketplaceError: string;
  onClearFilters: () => void;
  onCreateCustomHelper: () => void;
  onMarketplaceRetry: () => void;
  onRefresh: () => void;
  refreshError: string;
  refreshNotice: string;
  visibleMarketplaceCount: number;
};

export function MarketplaceStatusStates(props: MarketplaceStatusStatesProps) {
  const {
    canUseCreatorTools,
    formatError,
    hasInstallableMarketplaceAgent,
    installedMarketplaceMatchesLength,
    isRefreshing,
    marketplaceAgentCount,
    marketplaceError,
    onClearFilters,
    onCreateCustomHelper,
    onMarketplaceRetry,
    onRefresh,
    refreshError,
    refreshNotice,
    visibleMarketplaceCount
  } = props;

  return (
    <>
      {refreshError ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{refreshError}</p>
          <button onClick={onRefresh} type="button">Retry</button>
        </div>
      ) : null}
      {!refreshError && refreshNotice ? (
        <div className="friendly-status" role="status" aria-live="polite">
          <p>{refreshNotice}</p>
        </div>
      ) : null}
      {marketplaceError ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{formatError(marketplaceError)}</p>
          <button onClick={onMarketplaceRetry} type="button">Retry</button>
        </div>
      ) : null}
      {isRefreshing && marketplaceAgentCount === 0 ? <p className="empty">Loading marketplace agents…</p> : null}
      {!isRefreshing && visibleMarketplaceCount === 0 ? (
        <div className="friendly-empty-state">
          <strong>No matching helpers found</strong>
          <p>Try a broader goal like "daily tasks", "travel", "apply for jobs", or clear filters to see more helpers.</p>
          <button onClick={onClearFilters} type="button">Clear filters</button>
        </div>
      ) : null}
      {!isRefreshing && marketplaceAgentCount > 0 && !hasInstallableMarketplaceAgent && !installedMarketplaceMatchesLength ? (
        <div className="marketplace-all-added">
          <strong>You already added these helpers</strong>
          <span>{canUseCreatorTools ? "Try another need, search for a different helper, or create a custom one." : "Try another need or search for a different helper."}</span>
          {canUseCreatorTools ? <button onClick={onCreateCustomHelper} type="button"><Pencil size={16} /> Create custom helper</button> : null}
        </div>
      ) : null}
    </>
  );
}
