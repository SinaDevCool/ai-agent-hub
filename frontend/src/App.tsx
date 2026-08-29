import { useEffect, useMemo, useState } from "react";
import { apiPost } from "./api/client";
import type { UserAgentInstall } from "./api/types";
import { AppDialogs } from "./components/dialogs/AppDialogs";
import { WorkspaceSections } from "./components/sections/WorkspaceSections";
import { AppShell } from "./components/shell/AppShell";
import { AuthLoadingScreen, AuthSignInScreen } from "./components/shell/AuthScreens";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useAgentChat, type AgentProfileTab } from "./hooks/useAgentChat";
import { useAgentWizard } from "./hooks/useAgentWizard";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCreator } from "./hooks/useCreator";
import { useConnectors } from "./hooks/useConnectors";
import { useCreatorAccess } from "./hooks/useCreatorAccess";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useGuidedSetup } from "./hooks/useGuidedSetup";
import { agentStatusFilters, useInstalledAgents } from "./hooks/useInstalledAgents";
import { useMarketplace } from "./hooks/useMarketplace";
import { useMarketplaceActions } from "./hooks/useMarketplaceActions";
import { useModeration } from "./hooks/useModeration";
import { usePermissionWorkflow } from "./hooks/usePermissionWorkflow";
import { useVaultWorkflow } from "./hooks/useVaultWorkflow";
import { useWorkflows } from "./hooks/useWorkflows";
import { useLifePlatform } from "./hooks/useLifePlatform";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import {
  agentCannotDo,
  agentReadiness,
  agentReadinessFor,
  approvalPlainSentence,
  approvalReason,
  friendlyTrustLabel,
  isTestAgent,
  permissionProgress,
  promptRiskPreview,
  promptSuggestions
} from "./lib/agentDisplay";
import {
  agentTemplates,
  categoryOptions,
  marketplaceCategoryOptions,
  marketplaceFilterLabels,
  marketplaceNeedOptions,
  toolOptions
} from "./lib/appCatalog";
import {
  friendlyAppError,
  friendlyDate,
  friendlyLogDetail,
  friendlyLogText,
  friendlyNotificationText,
  friendlyResult,
  getStarterInfoPlaceholder,
  runtimeSummary
} from "./lib/appText";
import { friendlyActionName, friendlyList, friendlyToolName } from "./lib/display";
import { marketplaceExamplePrompts, marketplaceTrustReasons } from "./lib/marketplaceDisplay";
import { buildPrivacyExportPayload, downloadJson } from "./lib/privacyExport";
import { parseRealtimeEvent, shouldRefreshForRealtimeEvent } from "./lib/realtimeEvents";

type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
  onConfirm: () => Promise<void> | void;
};

const WS_URL = import.meta.env.VITE_WS_URL
  ?? (import.meta.env.DEV ? `ws://${window.location.hostname}:4141/ws` : "");
const APP_ENV = import.meta.env.VITE_APP_ENV ?? (import.meta.env.DEV ? "local" : "production");

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function App() {
  const auth = useAuthSession();
  const workspaceData = useWorkspaceData({ formatError: friendlyAppError });
  const {
    agents,
    marketplaceAgents,
    installedAgents,
    schemas,
    documents,
    logs,
    providerReceipts,
    hitl,
    isRefreshing,
    refreshError,
    refresh
  } = workspaceData;
  const creator = useCreator({ formatError: friendlyAppError });
  const creatorAccess = useCreatorAccess({ formatError: friendlyAppError });
  const currentUser = useCurrentUser({ formatError: friendlyAppError });
  const moderation = useModeration({ formatError: friendlyAppError });
  const connectors = useConnectors({ formatError: friendlyAppError });
  const workflows = useWorkflows({ formatError: friendlyAppError });
  const lifePlatform = useLifePlatform({ formatError: friendlyAppError });
  const {
    agentSearch,
    agentStatusFilter,
    agentSummary,
    hiddenTestAgentCount,
    hideTestAgents,
    isAgentAddOpen,
    isAgentFiltersOpen,
    mobileInstalledAgentCards,
    pinnedAgentIds,
    selectedAgent,
    setAgentSearch,
    setAgentStatusFilter,
    setHideTestAgents,
    setIsAgentAddOpen,
    setIsAgentFiltersOpen,
    setSelectedAgentId,
    togglePinnedAgent,
    visibleAgents,
    visibleInstalledAgentCards
  } = useInstalledAgents({
    agentReadinessFor,
    agents,
    hitl,
    isTestAgent,
    permissionProgress,
    schemas
  });
  const [connectionState, setConnectionState] = useState("connecting");
  const [toolResult, setToolResult] = useState<string>("No agent action yet.");
  const {
    activeSection,
    setActiveSection,
    heading,
    sectionClass,
    activeMobileClass,
    scrollToSection
  } = useAppNavigation("home");
  const {
    agentDraft,
    agentWizardStep,
    applyAgentTemplate,
    createAgent,
    createAgentError,
    isAddingAgent,
    isCreatingAgent,
    openAgentWizard,
    selectedTemplateId,
    setAgentWizardStep,
    setIsAddingAgent,
    updateAgentDraft
  } = useAgentWizard({
    agentTemplates,
    formatError: friendlyAppError,
    refresh,
    scrollToSection,
    setSelectedAgentId,
    setToolResult
  });
  const [confirmation, setConfirmation] = useState<ConfirmationDialog | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isMobileAgentDetailOpen, setIsMobileAgentDetailOpen] = useState(false);
  const [startupRetryMessage, setStartupRetryMessage] = useState("");
  const canModerateMarketplace = currentUser.capabilities.canModerateMarketplace;
  const canUseCreatorTools = currentUser.capabilities.canCreateMarketplaceAgents;

  async function refreshWithRetry() {
    setStartupRetryMessage("");
    const didRefresh = await refresh({
      maxAttempts: 4,
      retryDelayMs: 1500,
      onRetry: ({ attempt, maxAttempts }) => {
        setStartupRetryMessage(`Connecting to your agent service (${attempt + 1}/${maxAttempts})…`);
      }
    });
    setStartupRetryMessage("");
    return didRefresh;
  }

  function handleMarketplaceInstalled(install: UserAgentInstall) {
    marketplaceActions.handleMarketplaceInstalled(install);
  }

  function setAgentProfileTabFromMarketplace(tab: AgentProfileTab) {
    setAgentProfileTab(tab);
  }

  function setChatInputFromMarketplace(value: string) {
    setChatInput(value);
  }

  function setIsAddingVaultItemFromMarketplace(value: boolean) {
    setIsAddingVaultItem(value);
  }

  function setIsGuidedSetupOpenFromMarketplace(value: boolean) {
    setIsGuidedSetupOpen(value);
  }

  const marketplace = useMarketplace({
    marketplaceAgents,
    installedAgents,
    marketplaceNeedOptions,
    refresh,
    formatError: friendlyAppError,
    onInstalled: handleMarketplaceInstalled
  });
  const {
    marketplaceSearch,
    setMarketplaceSearch,
    marketplaceCategory,
    setMarketplaceCategory,
    matcherNeedId,
    setMatcherNeedId,
    matcherPrivateInfo,
    setMatcherPrivateInfo,
    matcherActions,
    setMatcherActions,
    marketplaceFilters,
    setMarketplaceFilters,
    confirmInstallAgent,
    setConfirmInstallAgent,
    marketplaceDetailAgent,
    setMarketplaceDetailAgent,
    installingAgentId,
    marketplaceError,
    setMarketplaceError,
    installedDefinitionIds,
    installedByDefinitionId,
    visibleMarketplaceAgents,
    prioritizedMarketplaceMatches,
    prioritizedMarketplaceAgents,
    marketplaceMatchById,
    selectedMarketplaceAgent,
    hasInstallableMarketplaceAgent,
    confirmMarketplaceInstall,
    applyMarketplaceMatcher,
    clearMarketplaceFilters,
    openMarketplaceDetails
  } = marketplace;
  const marketplaceActions = useMarketplaceActions({
    clearMarketplaceFilters,
    formatError: friendlyAppError,
    refresh,
    scrollToSection,
    setActiveSection,
    setAgentProfileTab: setAgentProfileTabFromMarketplace,
    setChatInput: setChatInputFromMarketplace,
    setIsAddingAgent,
    setIsAddingVaultItem: setIsAddingVaultItemFromMarketplace,
    setIsGuidedSetupOpen: setIsGuidedSetupOpenFromMarketplace,
    setMarketplaceCategory,
    setMarketplaceError,
    setMarketplaceFilters,
    setMarketplaceSearch,
    setMatcherActions,
    setMatcherNeedId,
    setMatcherPrivateInfo,
    setMobileAgentDetailOpen: setIsMobileAgentDetailOpen,
    setSelectedAgentId,
    setToolResult
  });
  const {
    addExternalImport,
    clearMarketplaceNeedContext,
    externalImportError,
    externalImportPreview,
    findAnotherAfterInstall,
    isExternalImportSaving,
    isOnboardingDismissed,
    marketplaceNeedContext,
    openMarketplace,
    openMarketplaceForNeed,
    recentInstall,
    reviewExternalImport,
    reviewRecentInstallAccess,
    setRecentInstall,
    tryRecentInstallPrompt
  } = marketplaceActions;
  const shouldShowOnboarding = activeSection === "home" && !isRefreshing && installedAgents.length === 0 && !isOnboardingDismissed;

  useEffect(() => {
    if (auth.isAuthConfigured && !auth.session) return;

    void refreshWithRetry();
    void currentUser.refreshCurrentUser();
    void creatorAccess.refreshMyCreatorAccess();
    void connectors.refreshConnectors();
    void workflows.refreshWorkflows();
    void lifePlatform.refreshLifePlatform();
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let shouldReconnect = true;

    const connectSocket = () => {
      if (!WS_URL) {
        setConnectionState("offline");
        return;
      }
      const protocols = ["ai-agent-hub"];
      if (auth.session?.access_token) protocols.push(`auth.${auth.session.access_token}`);
      socket = new WebSocket(WS_URL, protocols);
      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnectionState("live");
      };
      socket.onclose = () => {
        setConnectionState("offline");
        if (!shouldReconnect) return;
        reconnectAttempt += 1;
        const delayMs = Math.min(5000, 750 * reconnectAttempt);
        reconnectTimer = window.setTimeout(connectSocket, delayMs);
      };
      socket.onmessage = (message) => {
        const event = parseRealtimeEvent(message.data);
        if (event && shouldRefreshForRealtimeEvent(event)) void refresh();
      };
    };
    connectSocket();
    return () => {
      shouldReconnect = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [auth.isAuthConfigured, auth.session]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("connector=")) return;
    const queryText = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash.replace(/^#/, "");
    const params = new URLSearchParams(queryText);
    const status = params.get("connector");
    const message = params.get("message");
    if (message) connectors.setMessage(decodeURIComponent(message));
    if (status === "success") void connectors.refreshConnectors();
    window.history.replaceState(null, "", window.location.pathname + window.location.search + "#settings");
    scrollToSection("settings");
  }, []);

  useEffect(() => {
    if (!canUseCreatorTools) return;
    void creator.refreshCreator();
  }, [canUseCreatorTools]);

  useEffect(() => {
    if (activeSection === "creator" && !canUseCreatorTools) setActiveSection("home");
    if (activeSection === "moderation" && !canModerateMarketplace) setActiveSection("home");
  }, [activeSection, canModerateMarketplace, canUseCreatorTools, setActiveSection]);

  useEffect(() => {
    if (!canModerateMarketplace) return;
    void moderation.refreshModerationQueue();
    void creatorAccess.refreshCreatorAccessRequests();
  }, [canModerateMarketplace]);

  const {
    beginEditVaultItem,
    cancelVaultItemEdit,
    createVaultItem,
    createVaultItemError,
    deleteVaultItem,
    editingDocumentId,
    isAddingVaultItem,
    isCreatingVaultItem,
    isSearchingVault,
    reindexVault,
    runVaultSearch,
    saveVaultEdit,
    searchQuery,
    searchResults,
    searchSchemaId,
    searchVault,
    setIsAddingVaultItem,
    setSearchQuery,
    setSearchResults,
    setSearchSchemaId,
    updateVaultItemDraft,
    uploadVaultFile,
    vaultItemDraft
  } = useVaultWorkflow({
    formatError: friendlyAppError,
    friendlyResult,
    refresh,
    schemas,
    scrollToSection,
    selectedAgent,
    setConfirmation,
    setToolResult
  });

  useEffect(() => {
    if (activeSection !== "vault") setIsAddingVaultItem(false);
    if (activeSection !== "helpers") {
      setIsAddingAgent(false);
      setIsAgentAddOpen(false);
      setIsAgentFiltersOpen(false);
      setIsMobileAgentDetailOpen(false);
    }
  }, [activeSection, setIsAddingVaultItem, setIsAddingAgent, setIsAgentAddOpen, setIsAgentFiltersOpen, setIsMobileAgentDetailOpen]);

  const privacySummary = useMemo(() => buildPrivacyExportPayload({
    account: auth.session?.user.email ?? "Local development user",
    agents,
    documents,
    logs
  }), [agents, auth.session?.user.email, documents, logs]);

  const pendingApproval = hitl[0];
  const selectedAgentApprovals = useMemo(
    () => hitl.filter((request) => request.agent.id === selectedAgent?.id),
    [hitl, selectedAgent?.id]
  );
  const {
    agentConversation,
    agentProfileTab,
    agentRunResult,
    approvedContinuation,
    chatInput,
    chatTranscript,
    continueApprovedAction,
    decideHitl,
    decidingApprovalId,
    isAgentRunning,
    isConversationLoading,
    lastFailedPrompt,
    runAgentChat,
    setAgentProfileTab,
    setChatInput,
    submitAgentPrompt
  } = useAgentChat({
    refresh,
    selectedAgent,
    selectedAgentApprovals,
    setSearchResults,
    setToolResult
  });
  const {
    completeGuidedSetup,
    guidedAgentName,
    guidedInfoText,
    guidedPrompt,
    guidedSchema,
    guidedSetupError,
    guidedSetupStep,
    guidedTemplate,
    guidedTemplateId,
    guidedTemplates,
    isGuidedSetupOpen,
    isGuidedSetupSaving,
    openGuidedSetup,
    setGuidedInfoText,
    setGuidedSetupStep,
    setGuidedTemplateId,
    setIsGuidedSetupOpen
  } = useGuidedSetup({
    agents,
    agentTemplates,
    formatError: friendlyAppError,
    refresh,
    schemas,
    setActiveSection,
    setChatInput,
    setIsAddingAgent,
    setIsAddingVaultItem,
    setRecentInstall,
    setSelectedAgentId,
    setToolResult
  });
  const {
    allowedPermissionCount,
    grantingSchemaName,
    grantAllRequestedSchemas,
    grantRequestedSchema,
    permissionCenterRows,
    permissionReview,
    removeAgentFromProfile,
    revokeAllAgentAccess,
    revokeSelectedAgentAccess,
    selectedReadableInfo,
    togglePermission,
    ungrantedRequestedSchemas
  } = usePermissionWorkflow({
    agents,
    formatError: friendlyAppError,
    refresh,
    schemas,
    selectedAgent,
    setConfirmation,
    setSelectedAgentId,
    setToolResult
  });
  const readiness = agentReadiness(selectedAgent, ungrantedRequestedSchemas.length, selectedAgentApprovals.length);
  const suggestedPrompts = promptSuggestions(selectedAgent);
  const promptPreview = promptRiskPreview(chatInput, selectedAgent, ungrantedRequestedSchemas.length, selectedAgentApprovals.length);
  const selectedRiskyActions = selectedAgent?.capabilityManifest.highRiskActions ?? [];
  const selectedAgentTools = selectedAgent?.capabilityManifest.tools?.map(friendlyToolName) ?? [];
  const selectedCannotDo = agentCannotDo(selectedAgent);
  const selectedReadableInfoLabel = friendlyList(selectedReadableInfo, "Nothing yet");
  const selectedRiskyActionsLabel = friendlyList(selectedAgent?.capabilityManifest.highRiskActions?.map(friendlyActionName) ?? [], "No risky actions listed");
  const selectedAgentToolsLabel = friendlyList(selectedAgentTools, "Answer simple questions");
  const selectedCannotDoLabel = friendlyList(selectedCannotDo, "Nothing blocked");
  const agentNextStep = selectedAgentApprovals.length
    ? "Review what is waiting before this agent continues."
    : ungrantedRequestedSchemas.length
      ? "Give access only to the saved info this agent needs."
      : "Type what you need, or tap a starter prompt.";
  const runSummary = runtimeSummary(agentRunResult);
  const selectedAgentLogs = useMemo(
    () => logs.filter((log) => log.agent?.id === selectedAgent?.id).slice(0, 8),
    [logs, selectedAgent?.id]
  );
  const selectedAgentProviderReceipts = useMemo(
    () => providerReceipts.filter((receipt) => receipt.agentId === selectedAgent?.id).slice(0, 4),
    [providerReceipts, selectedAgent?.id]
  );
  const visibleApprovals = hitl.slice(0, 3);
  const visibleDocuments = documents.slice(0, 5);
  const recentLogs = logs.slice(0, 6);
  const recentProviderReceipts = providerReceipts.slice(0, 6);
  const setupSteps = [
    {
      label: "Pick an agent",
      detail: "Choose one to start",
      done: agents.length > 0
    },
    {
      label: "Add private info",
      detail: "Add details when useful",
      done: documents.length > 0
    },
    {
      label: "Approve access",
      detail: ungrantedRequestedSchemas.length ? `${ungrantedRequestedSchemas.length} requests to review` : "Only share what you allow",
      done: agents.length > 0 && ungrantedRequestedSchemas.length === 0
    },
    {
      label: "Ask for help",
      detail: selectedAgent ? "Send a first request" : "Choose an agent to start",
      done: Boolean(selectedAgent && chatTranscript.length > 0)
    }
  ];
  const setupProgress = setupSteps.filter((step) => step.done).length;
  const showSetupProgress = setupProgress < setupSteps.length;
  const primarySetupLabel = agents.length === 0
    ? "Pick your first agent"
    : documents.length === 0
      ? "Add private info"
      : ungrantedRequestedSchemas.length > 0
        ? "Review access"
        : selectedAgent
          ? "Use selected agent"
          : "Agent Pool";

  function runPrimarySetupAction() {
    if (agents.length === 0) {
      openMarketplace();
      return;
    }
    if (documents.length === 0) {
      setIsAddingVaultItem(true);
      scrollToSection("vault");
      return;
    }
    if (ungrantedRequestedSchemas.length > 0) {
      scrollToSection("clearance");
      return;
    }
    scrollToSection("helpers");
    setAgentProfileTab("chat");
  }

  async function triggerHighRiskAction() {
    if (!selectedAgent) return;
    const actionName = selectedAgent.capabilityManifest.highRiskActions?.[0];
    if (!actionName) {
      setToolResult(`${selectedAgent.name} has no approval-only actions configured.`);
      return;
    }
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "action.execute",
      arguments: { actionName, source: "settings_approval_test" }
    });
    setToolResult(friendlyResult(result as Record<string, unknown>));
    await refresh();
  }

  function exportMyData() {
    downloadJson("ai-agent-hub-export.json", privacySummary);
    setToolResult("Your workspace export was downloaded.");
  }

  async function runConfirmation() {
    if (!confirmation) return;
    setConfirmationError("");
    setIsConfirming(true);
    try {
      await confirmation.onConfirm();
      setConfirmation(null);
    } catch (error) {
      const message = friendlyAppError(error);
      setConfirmationError(message);
      setToolResult(message);
    } finally {
      setIsConfirming(false);
    }
  }

  if (auth.isAuthConfigured && auth.isAuthLoading) {
    return <AuthLoadingScreen />;
  }

  if (auth.isAuthConfigured && !auth.session) {
    return (
      <AuthSignInScreen
        authMessage={auth.authMessage}
        email={auth.email}
        isSendingMagicLink={auth.isSendingMagicLink}
        onEmailChange={auth.setEmail}
        onSubmit={(event) => void auth.sendMagicLink(event)}
      />
    );
  }

  return (
    <AppShell
      activeSection={activeSection}
      agentPoolShortcuts={marketplaceNeedOptions.slice(0, 5).map((need) => ({ id: need.id, label: need.title }))}
      canModerateMarketplace={canModerateMarketplace}
      canUseCreatorTools={canUseCreatorTools}
      connectionState={connectionState}
      environmentLabel={APP_ENV === "production" ? undefined : APP_ENV}
      heading={heading}
      onAddPrivateInfo={() => {
        setIsAddingVaultItem(true);
        scrollToSection("vault");
      }}
      onOpenAgentPoolNeed={(needId) => {
        const need = marketplaceNeedOptions.find((item) => item.id === needId);
        clearMarketplaceNeedContext();
        setMarketplaceCategory(need?.category ?? "All");
        setMarketplaceSearch(need?.query ?? "");
        scrollToSection("marketplace");
      }}
      onOpenAgentPool={() => openMarketplace()}
      onNavigate={scrollToSection}
      onSignOut={auth.session ? () => void auth.signOut() : undefined}
      userEmail={auth.session?.user.email}
    >
        <WorkspaceSections
          props={{
            activeMobileClass,
            activeSection,
            addExternalImport,
            agentConversation,
            agentDraft,
            agentProfileTab,
            agentRunResult,
            agents,
            agentTemplates,
            agentWizardStep,
            allowedPermissionCount,
            applyAgentTemplate,
            applyMarketplaceMatcher,
            approvalPlainSentence,
            approvalReason,
            approvedContinuation,
            auth,
            beginEditVaultItem,
            canModerateMarketplace,
            canUseCreatorTools,
            cancelVaultItemEdit,
            categoryOptions,
            chatInput,
            chatTranscript,
            clearMarketplaceFilters,
            clearMarketplaceNeedContext,
            completeGuidedSetup,
            continueApprovedAction,
            createAgent,
            createAgentError,
            createVaultItem,
            createVaultItemError,
            creator,
            connectors,
            creatorAccess,
            workflows,
            lifePlatform,
            decidingApprovalId,
            decideHitl,
            deleteVaultItem,
            documents,
            editingDocumentId,
            externalImportError,
            externalImportPreview,
            exportMyData,
            findAnotherAfterInstall,
            friendlyActionName,
            friendlyAppError,
            friendlyDate,
            friendlyLogDetail,
            friendlyLogText,
            friendlyNotificationText,
            friendlyTrustLabel,
            getStarterInfoPlaceholder,
            grantAllRequestedSchemas,
            grantingSchemaName,
            grantRequestedSchema,
            guidedAgentName,
            guidedInfoText,
            guidedPrompt,
            guidedSchema,
            guidedSetupError,
            guidedSetupStep,
            guidedTemplate,
            guidedTemplateId,
            guidedTemplates,
            hasInstallableMarketplaceAgent,
            agentNextStep,
            agentSearch,
            agentStatusFilter,
            agentStatusFilters,
            agentSummary,
            hiddenTestAgentCount,
            hideTestAgents,
            hitl,
            installedAgents,
            installedByDefinitionId,
            installedDefinitionIds,
            installingAgentId,
            isAddingAgent,
            isAddingVaultItem,
            isAgentRunning,
            isConversationLoading,
            isCreatingAgent,
            isCreatingVaultItem,
            isExternalImportSaving,
            isGuidedSetupOpen,
            isGuidedSetupSaving,
            isAgentAddOpen,
            isAgentFiltersOpen,
            isMobileAgentDetailOpen,
            isRefreshing,
            isSearchingVault,
            lastFailedPrompt,
            logs,
          marketplaceAgents,
            marketplaceCategory,
            marketplaceCategoryOptions,
            marketplaceError,
            marketplaceExamplePrompts,
            marketplaceFilterLabels,
            marketplaceFilters,
            marketplaceMatchById,
            marketplaceNeedContext,
            marketplaceNeedOptions,
            marketplaceSearch,
            marketplaceTrustReasons,
            matcherActions,
            matcherNeedId,
            matcherPrivateInfo,
            mobileInstalledAgentCards,
            moderation,
          openAgentWizard,
            openGuidedSetup,
            openMarketplace,
            openMarketplaceDetails,
            openMarketplaceForNeed,
            pendingApproval,
            permissionCenterRows,
            permissionProgress,
            permissionReview,
            pinnedAgentIds,
            primarySetupLabel,
            providerReceipts,
            prioritizedMarketplaceAgents,
            prioritizedMarketplaceMatches,
            promptPreview,
            readiness,
            recentInstall,
            recentLogs,
            recentProviderReceipts,
            refresh,
            refreshError,
            refreshWithRetry,
            reindexVault,
            removeAgentFromProfile,
            reviewExternalImport,
            reviewRecentInstallAccess,
            revokeAllAgentAccess,
            revokeSelectedAgentAccess,
            runAgentChat,
            runPrimarySetupAction,
            runSummary,
            runVaultSearch,
            saveVaultEdit,
            schemas,
            scrollToSection,
            searchQuery,
            searchResults,
            searchSchemaId,
            searchVault,
            sectionClass,
            selectedAgent,
            selectedAgentApprovals,
            selectedAgentLogs,
            selectedAgentProviderReceipts,
            selectedCannotDoLabel,
            selectedAgentToolsLabel,
            selectedMarketplaceAgent,
            selectedReadableInfo,
            selectedReadableInfoLabel,
            selectedRiskyActions,
            selectedRiskyActionsLabel,
            selectedTemplateId,
            setAgentProfileTab,
          setAgentWizardStep,
          setChatInput,
          setConfirmInstallAgent,
            setGuidedInfoText,
            setGuidedSetupStep,
            setGuidedTemplateId,
          setAgentSearch,
            setAgentStatusFilter,
            setHideTestAgents,
            setIsAddingAgent,
            setIsAddingVaultItem,
            setIsGuidedSetupOpen,
            setIsAgentAddOpen,
            setIsAgentFiltersOpen,
            setMarketplaceCategory,
            setMarketplaceError,
            setMarketplaceFilters,
            setMarketplaceSearch,
            setMatcherActions,
            setMatcherNeedId,
            setMatcherPrivateInfo,
            setMobileAgentDetailOpen: setIsMobileAgentDetailOpen,
            setRecentInstall,
            setSearchQuery,
            setSearchSchemaId,
            setSelectedAgentId,
            setupProgress,
            setupSteps,
            shouldShowOnboarding,
            showSetupProgress,
            startupRetryMessage,
            submitAgentPrompt,
            suggestedPrompts,
            toggleListValue,
            togglePermission,
            togglePinnedAgent,
            toolOptions,
            toolResult,
            triggerHighRiskAction,
            tryRecentInstallPrompt,
            ungrantedRequestedSchemas,
            updateAgentDraft,
            updateVaultItemDraft,
            uploadVaultFile,
            vaultItemDraft,
            visibleAgents,
            visibleApprovals,
            visibleDocuments,
            visibleInstalledAgentCards,
            visibleMarketplaceAgents
          }}
        />
        <AppDialogs
          confirmation={confirmation}
          confirmationError={confirmationError}
          confirmInstallAgent={confirmInstallAgent}
          confirmMarketplaceInstall={confirmMarketplaceInstall}
          friendlyActionName={friendlyActionName}
          hitl={hitl}
          installedByDefinitionId={installedByDefinitionId}
          installingAgentId={installingAgentId}
          isConfirming={isConfirming}
          marketplaceDetailAgent={marketplaceDetailAgent}
          marketplaceExamplePrompts={marketplaceExamplePrompts}
          marketplaceTrustReasons={marketplaceTrustReasons}
          permissionProgress={permissionProgress}
          runConfirmation={runConfirmation}
          schemas={schemas}
          scrollToSection={scrollToSection}
          setAgentProfileTab={setAgentProfileTab}
          setConfirmInstallAgent={setConfirmInstallAgent}
          setConfirmation={(nextConfirmation) => {
            setConfirmationError("");
            setConfirmation(nextConfirmation);
          }}
          setMarketplaceDetailAgent={setMarketplaceDetailAgent}
          setSelectedAgentId={setSelectedAgentId}
        />    </AppShell>
  );
}
