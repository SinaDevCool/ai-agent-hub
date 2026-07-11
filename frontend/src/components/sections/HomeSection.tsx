import type { Dispatch, SetStateAction } from "react";
import { Bot, FilePlus, Search } from "lucide-react";
import type { Agent, HitlRequest } from "../../api/types";
import type { SectionId } from "../../lib/appNavigation";
import { OnboardingPanel, primaryOnboardingNeeds, type OnboardingNeed } from "../OnboardingPanel";
import type { SetupStep } from "./WorkspaceSections.types";

type HomeSectionProps = {
  activeSection: SectionId;
  activeMobileClass: (section: SectionId) => string;
  agents: Agent[];
  canUseCreatorTools: boolean;
  friendlyActionName: (action: string) => string;
  friendlyTrustLabel: (score: number) => string;
  onOpenGuidedSetup: () => void;
  openMarketplace: () => void;
  openMarketplaceForNeed: (need: OnboardingNeed) => void;
  pendingApproval: HitlRequest | undefined;
  primarySetupLabel: string;
  runPrimarySetupAction: () => void;
  scrollToSection: (section: SectionId) => void;
  sectionClass: (section: SectionId) => string;
  setIsAddingVaultItem: Dispatch<SetStateAction<boolean>>;
  setSelectedAgentId: (agentId: string) => void;
  setupProgress: number;
  setupSteps: SetupStep[];
  shouldShowOnboarding: boolean;
  showSetupProgress: boolean;
  visibleAgents: Agent[];
};

export function HomeSection(props: HomeSectionProps) {
  const {
    activeSection,
    activeMobileClass,
    agents,
    canUseCreatorTools,
    friendlyActionName,
    friendlyTrustLabel,
    onOpenGuidedSetup,
    openMarketplace,
    openMarketplaceForNeed,
    pendingApproval,
    primarySetupLabel,
    runPrimarySetupAction,
    scrollToSection,
    sectionClass,
    setIsAddingVaultItem,
    setSelectedAgentId,
    setupProgress,
    setupSteps,
    shouldShowOnboarding,
    showSetupProgress,
    visibleAgents
  } = props;

  return (
    <>
      <section className={`mobile-home ${activeSection === "home" && !shouldShowOnboarding ? "is-mobile-home-active" : ""}`} aria-label="Mobile overview">
        <div className="mobile-home-card">
          <span className="mobile-label">Your agent hub</span>
          <h2>What do you want help with?</h2>
          <p>Choose one agent for a real task. It starts restricted, and you approve what it can read or do.</p>
          <div className="setup-roadmap compact" aria-label="Setup progress">
            {setupSteps.map((step, index) => (
              <div className={step.done ? "setup-step done" : "setup-step"} key={step.label}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="mobile-quick-actions">
            <button className="primary-action" onClick={runPrimarySetupAction} type="button"><Bot size={16} /> {primarySetupLabel}</button>
            <button onClick={() => setIsAddingVaultItem((current: boolean) => !current)} type="button"><FilePlus size={16} /> Add Private Info</button>
          </div>
        </div>
        {pendingApproval ? (
          <button className="mobile-alert-card" onClick={() => scrollToSection("clearance")} type="button">
            <span>Waiting for you</span>
            <strong>{pendingApproval.agent.name}</strong>
            <small>{friendlyActionName(pendingApproval.actionName)}</small>
          </button>
        ) : null}
      </section>

      {shouldShowOnboarding ? (
        <OnboardingPanel
          className={`panel onboarding-panel mobile-section desktop-section ${activeMobileClass("home")} ${sectionClass("home")}`}
          onBrowseAll={() => openMarketplace()}
          onSelectNeed={openMarketplaceForNeed}
        />
      ) : null}

      {!shouldShowOnboarding ? (
        <section className={`home-dashboard desktop-section ${sectionClass("home")}`} id="home">
          <div className="panel home-card home-primary-card">
            <div className="panel-title">{agents.length ? "Choose Your Next Agent" : "Pick Your First Agent"}</div>
            <h2>What do you want help with?</h2>
            <p>Pick a real-life need first. The agent pool will show agents that match the task and explain what each one may read or do.</p>
            <div className="home-category-grid starter-goal-grid" aria-label="Choose an agent need">
              {primaryOnboardingNeeds.map((need) => {
                const Icon = need.icon;
                return (
                  <button key={need.id} onClick={() => openMarketplaceForNeed(need)} type="button">
                    <Icon size={16} />
                    <span>{need.title}</span>
                    <small>{need.detail}</small>
                    <em>{need.category}</em>
                  </button>
                );
              })}
            </div>
            {showSetupProgress ? (
              <>
                <div className="setup-progress-line">
                  <span>{setupProgress} of {setupSteps.length} steps complete</span>
                  <div aria-hidden="true"><span style={{ width: `${(setupProgress / setupSteps.length) * 100}%` }} /></div>
                </div>
                <div className="setup-roadmap" aria-label="Setup progress">
                  {setupSteps.map((step, index) => (
                    <div className={step.done ? "setup-step done" : "setup-step"} key={step.label}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <small>{step.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <div className="button-row">
              <button className="primary-action" onClick={runPrimarySetupAction} type="button"><Bot size={16} /> {primarySetupLabel}</button>
              <button onClick={() => openMarketplace()} type="button"><Search size={16} /> Browse Agents</button>
              {canUseCreatorTools ? <button onClick={() => onOpenGuidedSetup()} type="button"><Bot size={16} /> Create custom agent</button> : null}
            </div>
          </div>

          <div className="panel home-card home-agents-card">
            <div className="panel-heading-row">
              <div>
                <div className="panel-title">My Agents</div>
                <p className="home-card-intro">Open an agent you already use, or browse the pool for a better match.</p>
              </div>
              {agents.length ? <span className="home-agent-count">{agents.length}</span> : null}
            </div>
            {visibleAgents.slice(0, 3).map((agent) => (
              <button
                className="home-agent-card"
                key={`home-${agent.id}`}
                onClick={() => {
                  setSelectedAgentId(agent.id);
                  scrollToSection("helpers");
                }}
                type="button"
              >
                <span className="home-agent-main">
                  <strong>{agent.name}</strong>
                  <small>{agent.category}</small>
                </span>
                <span className="home-agent-meta">{friendlyTrustLabel(agent.trustScore)}</span>
              </button>
            ))}
            {agents.length === 0 ? <p className="empty">Find your first agent to get started.</p> : null}
          </div>

          {pendingApproval ? (
            <div className="panel home-card">
              <div className="panel-title">What Needs You</div>
              <button className="home-list-button alert" onClick={() => scrollToSection("clearance")} type="button">
                <span>{pendingApproval.agent.name} is waiting for you</span>
                <small>{friendlyActionName(pendingApproval.actionName)}</small>
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
