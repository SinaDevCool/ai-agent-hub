import { useState } from "react";
import { importExternalAgent, previewExternalAgentImport } from "../api/externalAgents";
import type { ExternalAgentImportInput, ExternalAgentImportPreview, UserAgentInstall } from "../api/types";
import type { OnboardingNeed } from "../components/OnboardingPanel";
import type { RecentInstallSummary } from "../components/InstallSuccessPanel";
import type { AgentProfileTab } from "./useAgentChat";
import type { MatcherChoice, MarketplaceFilters } from "../lib/marketplaceMatching";
import type { SectionId } from "../lib/appNavigation";

type UseMarketplaceActionsInput = {
  clearMarketplaceFilters: () => void;
  formatError: (error: unknown) => string;
  refresh: () => Promise<unknown>;
  scrollToSection: (section: SectionId) => void;
  setActiveSection: (section: SectionId) => void;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  setChatInput: (value: string) => void;
  setIsAddingAgent: (value: boolean) => void;
  setIsAddingVaultItem: (value: boolean) => void;
  setIsGuidedSetupOpen: (value: boolean) => void;
  setMarketplaceCategory: (value: string) => void;
  setMarketplaceError: (value: string) => void;
  setMarketplaceFilters: (value: MarketplaceFilters) => void;
  setMarketplaceSearch: (value: string) => void;
  setMatcherActions: (value: MatcherChoice) => void;
  setMatcherNeedId: (value: string) => void;
  setMatcherPrivateInfo: (value: MatcherChoice) => void;
  setMobileAgentDetailOpen: (value: boolean) => void;
  setSelectedAgentId: (agentId: string) => void;
  setToolResult: (value: string) => void;
};

function recentInstallFromInstall(install: UserAgentInstall): RecentInstallSummary {
  const manifest = install.agentVersion.capabilityManifest ?? install.agentDefinition.versions[0]?.capabilityManifest ?? {};
  return {
    agentId: install.agent?.id,
    displayName: install.displayName,
    category: install.agentDefinition.category,
    requestedSchemas: manifest.requestedSchemas ?? [],
    highRiskActions: manifest.highRiskActions ?? [],
    firstPrompt: manifest.examplePrompts?.[0] ?? ""
  };
}

export function useMarketplaceActions(input: UseMarketplaceActionsInput) {
  const [recentInstall, setRecentInstall] = useState<RecentInstallSummary | null>(null);
  const [marketplaceNeedContext, setMarketplaceNeedContext] = useState<OnboardingNeed | null>(null);
  const [externalImportPreview, setExternalImportPreview] = useState<ExternalAgentImportPreview | null>(null);
  const [externalImportError, setExternalImportError] = useState("");
  const [isExternalImportSaving, setIsExternalImportSaving] = useState(false);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);

  function openMarketplace(options: { preserveNeedContext?: boolean } = {}) {
    setIsOnboardingDismissed(true);
    setRecentInstall(null);
    if (!options.preserveNeedContext) setMarketplaceNeedContext(null);
    input.setActiveSection("marketplace");
    input.setIsAddingAgent(false);
    input.setIsGuidedSetupOpen(false);
    input.setIsAddingVaultItem(false);
    input.setMarketplaceError("");
    input.scrollToSection("marketplace");
  }

  function handleMarketplaceInstalled(install: UserAgentInstall) {
    const installedAgentId = install.agent?.id;
    if (installedAgentId) input.setSelectedAgentId(installedAgentId);
    input.setMobileAgentDetailOpen(false);
    setRecentInstall(recentInstallFromInstall(install));
    input.setToolResult(`${install.displayName} was added to your profile. Review its permissions before giving access.`);
    setIsOnboardingDismissed(true);
    input.scrollToSection("helpers");
  }

  async function reviewExternalImport(importInput: ExternalAgentImportInput) {
    setExternalImportError("");
    setIsExternalImportSaving(true);
    try {
      const result = await previewExternalAgentImport(importInput);
      setExternalImportPreview(result.preview);
      return result.preview;
    } catch (error) {
      setExternalImportError(input.formatError(error));
      setExternalImportPreview(null);
      return null;
    } finally {
      setIsExternalImportSaving(false);
    }
  }

  async function addExternalImport(importInput: ExternalAgentImportInput) {
    setExternalImportError("");
    setIsExternalImportSaving(true);
    try {
      const result = await importExternalAgent(importInput);
      await input.refresh();
      const installedAgentId = result.install.agent?.id;
      if (installedAgentId) input.setSelectedAgentId(installedAgentId);
      input.setMobileAgentDetailOpen(false);
      setRecentInstall(recentInstallFromInstall(result.install));
      input.setToolResult(`${result.install.displayName} was imported and starts restricted.`);
      setExternalImportPreview(null);
      setIsOnboardingDismissed(true);
      input.scrollToSection("helpers");
      return true;
    } catch (error) {
      setExternalImportError(input.formatError(error));
      return false;
    } finally {
      setIsExternalImportSaving(false);
    }
  }

  function openMarketplaceForNeed(need: OnboardingNeed) {
    setIsOnboardingDismissed(true);
    setMarketplaceNeedContext(need);
    input.setMarketplaceCategory(need.category);
    input.setMarketplaceSearch(need.query);
    input.setMatcherNeedId(need.matcherNeedId);
    input.setMatcherPrivateInfo("unsure");
    input.setMatcherActions("unsure");
    input.setMarketplaceFilters({
      usesPrivateInfo: false,
      canTakeActions: false,
      needsApproval: false
    });
    openMarketplace({ preserveNeedContext: true });
  }

  function clearMarketplaceNeedContext() {
    setMarketplaceNeedContext(null);
    input.clearMarketplaceFilters();
  }

  function reviewRecentInstallAccess() {
    if (!recentInstall) return;
    if (recentInstall.agentId) input.setSelectedAgentId(recentInstall.agentId);
    setRecentInstall(null);
    input.scrollToSection("clearance");
  }

  function tryRecentInstallPrompt() {
    if (!recentInstall?.agentId) return;
    input.setSelectedAgentId(recentInstall.agentId);
    input.setAgentProfileTab("chat");
    input.setChatInput(recentInstall.firstPrompt || `Help me get started with ${recentInstall.displayName}.`);
    input.setMobileAgentDetailOpen(true);
    setRecentInstall(null);
    input.scrollToSection("helpers");
  }

  function findAnotherAfterInstall() {
    setRecentInstall(null);
    openMarketplace();
  }

  return {
    addExternalImport,
    clearMarketplaceNeedContext,
    externalImportError,
    externalImportPreview,
    findAnotherAfterInstall,
    handleMarketplaceInstalled,
    isExternalImportSaving,
    isOnboardingDismissed,
    marketplaceNeedContext,
    openMarketplace,
    openMarketplaceForNeed,
    recentInstall,
    reviewExternalImport,
    reviewRecentInstallAccess,
    setIsOnboardingDismissed,
    setMarketplaceNeedContext,
    setRecentInstall,
    tryRecentInstallPrompt
  };
}
