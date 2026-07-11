import { Search } from "lucide-react";
import type { MatcherChoice, MarketplaceNeed } from "../../lib/marketplaceMatching";

const matcherChoices: MatcherChoice[] = ["unsure", "yes", "no"];

type MarketplaceMatcherProps = {
  matcherActions: MatcherChoice;
  matcherNeedId: string;
  matcherPrivateInfo: MatcherChoice;
  marketplaceNeedOptions: MarketplaceNeed[];
  onApplyMatcher: () => void;
  setMatcherActions: (value: MatcherChoice) => void;
  setMatcherNeedId: (value: string) => void;
  setMatcherPrivateInfo: (value: MatcherChoice) => void;
};

export function MarketplaceMatcher(props: MarketplaceMatcherProps) {
  const {
    matcherActions,
    matcherNeedId,
    matcherPrivateInfo,
    marketplaceNeedOptions,
    onApplyMatcher,
    setMatcherActions,
    setMatcherNeedId,
    setMatcherPrivateInfo
  } = props;

  return (
    <div className="helper-match-panel" aria-label="Helper matcher">
      <div>
        <strong>Find the right helper faster</strong>
        <span>Answer three simple questions. You can still change the results after.</span>
      </div>
      <label>
        <span>I need help with</span>
        <select autoComplete="off" name="marketplace-need" value={matcherNeedId} onChange={(event) => setMatcherNeedId(event.currentTarget.value)}>
          {marketplaceNeedOptions.map((need) => <option key={need.id} value={need.id}>{need.title}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Will it use private info?</legend>
        {matcherChoices.map((choice) => (
          <label key={`info-${choice}`}>
            <input checked={matcherPrivateInfo === choice} name="marketplace-private-info" onChange={() => setMatcherPrivateInfo(choice)} type="radio" />
            <span>{choice === "unsure" ? "Not sure" : choice === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Can it take actions?</legend>
        {matcherChoices.map((choice) => (
          <label key={`actions-${choice}`}>
            <input checked={matcherActions === choice} name="marketplace-actions" onChange={() => setMatcherActions(choice)} type="radio" />
            <span>{choice === "unsure" ? "Not sure" : choice === "yes" ? "Yes, with approval" : "No"}</span>
          </label>
        ))}
      </fieldset>
      <button className="primary-action" onClick={onApplyMatcher} type="button"><Search size={16} /> Show matches</button>
    </div>
  );
}
