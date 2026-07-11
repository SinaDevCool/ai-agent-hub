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
  onCreateCustomAgent: () => void;
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
    onCreateCustomAgent,
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
      {isRefreshing && marketplaceAgentCount === 0 ? <p className="empty">Loading agents…</p> : null}
      {!isRefreshing && visibleMarketplaceCount === 0 ? (
        <div className="friendly-empty-state">
          <strong>No matching agents found</strong>
          <p>Try a broader goal like "daily tasks", "travel", "apply for jobs", or clear filters to see more agents.</p>
          <div className="button-row">
            <button onClick={onClearFilters} type="button">Clear filters</button>
            {canUseCreatorTools ? <button onClick={onCreateCustomAgent} type="button"><Pencil size={16} /> Create custom agent</button> : null}
          </div>
        </div>
      ) : null}
      {!isRefreshing && marketplaceAgentCount > 0 && !hasInstallableMarketplaceAgent && !installedMarketplaceMatchesLength ? (
        <div className="marketplace-all-added">
          <strong>You already added these agents</strong>
          <span>{canUseCreatorTools ? "Try another need, search for a different agent, or create a custom one." : "Try another need or search for a different agent."}</span>
          {canUseCreatorTools ? <button onClick={onCreateCustomAgent} type="button"><Pencil size={16} /> Create custom agent</button> : null}
        </div>
      ) : null}
    </>
  );
}
