import type { OnboardingNeed } from "../OnboardingPanel";

type MarketplaceNeedBannerProps = {
  selectedNeedContext?: OnboardingNeed | null;
  onClearNeedContext: () => void;
};

export function MarketplaceNeedBanner(props: MarketplaceNeedBannerProps) {
  if (!props.selectedNeedContext) return null;

  return (
    <section className="marketplace-recommendation-banner" aria-label="Recommended helper context">
      <div>
        <strong>Showing helpers for {props.selectedNeedContext.title}</strong>
        <span>{props.selectedNeedContext.recommendation}</span>
      </div>
      <button onClick={props.onClearNeedContext} type="button">Browse all helpers</button>
    </section>
  );
}
