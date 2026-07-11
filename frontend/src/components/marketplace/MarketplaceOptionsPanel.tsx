import { Download, Pencil } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { MarketplaceFilters } from "../../lib/marketplaceMatching";

type MarketplaceOptionsPanelProps = {
  canUseCreatorTools: boolean;
  externalImportSlot?: ReactNode;
  isImportOpen: boolean;
  marketplaceFilterLabels: Array<{ id: keyof MarketplaceFilters; label: string }>;
  marketplaceFilters: MarketplaceFilters;
  onCreateCustomHelper: () => void;
  setIsImportOpen: (updater: (current: boolean) => boolean) => void;
  setMarketplaceFilters: Dispatch<SetStateAction<MarketplaceFilters>>;
};

export function MarketplaceOptionsPanel(props: MarketplaceOptionsPanelProps) {
  const {
    canUseCreatorTools,
    externalImportSlot,
    isImportOpen,
    marketplaceFilterLabels,
    marketplaceFilters,
    onCreateCustomHelper,
    setIsImportOpen,
    setMarketplaceFilters
  } = props;

  return (
    <div className="marketplace-options-panel">
      <div className="marketplace-filter-row" aria-label="Marketplace filters">
        {marketplaceFilterLabels.map((filter) => (
          <label key={filter.id}>
            <input
              checked={marketplaceFilters[filter.id]}
              onChange={(event) => {
                const isChecked = event.currentTarget.checked;
                setMarketplaceFilters((current) => ({ ...current, [filter.id]: isChecked }));
              }}
              type="checkbox"
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </div>
      {canUseCreatorTools && externalImportSlot ? (
        <button aria-expanded={isImportOpen} onClick={() => setIsImportOpen((current) => !current)} type="button">
          <Download size={16} /> Import external helper
        </button>
      ) : null}
      {canUseCreatorTools ? <button onClick={onCreateCustomHelper} type="button">
        <Pencil size={16} /> Create custom helper
      </button> : null}
    </div>
  );
}
