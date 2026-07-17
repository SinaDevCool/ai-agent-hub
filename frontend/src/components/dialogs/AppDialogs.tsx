import { ConfirmDialog } from "./ConfirmDialog";
import { InstallConfirmDialog } from "./InstallConfirmDialog";
import { MarketplaceDetailSheet } from "../marketplace/MarketplaceDetailSheet";
import type { Agent, HitlRequest, MarketplaceAgent, VaultSchema, UserAgentInstall } from "../../api/types";
import type { AgentProfileTab } from "../../hooks/useAgentChat";
import type { SectionId } from "../../lib/appNavigation";
import type { PermissionProgress } from "../sections/WorkspaceSections.types";

type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
  onConfirm: () => Promise<void> | void;
};

type AppDialogsProps = {
  confirmation: ConfirmationDialog | null;
  confirmationError: string;
  confirmInstallAgent: MarketplaceAgent | null;
  confirmMarketplaceInstall: () => void | Promise<void>;
  friendlyActionName: (action: string) => string;
  hitl: HitlRequest[];
  installedByDefinitionId: Map<string, UserAgentInstall>;
  installingAgentId: string;
  isConfirming: boolean;
  marketplaceDetailAgent: MarketplaceAgent | null;
  marketplaceExamplePrompts: (agent: MarketplaceAgent | undefined) => string[];
  marketplaceTrustReasons: (agent: MarketplaceAgent | undefined) => string[];
  permissionProgress: (agent: Agent | undefined, schemas: VaultSchema[]) => PermissionProgress;
  runConfirmation: () => void | Promise<void>;
  schemas: VaultSchema[];
  scrollToSection: (section: SectionId) => void;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  setConfirmInstallAgent: (agent: MarketplaceAgent | null) => void;
  setConfirmation: (confirmation: ConfirmationDialog | null) => void;
  setMarketplaceDetailAgent: (agent: MarketplaceAgent | null) => void;
  setSelectedAgentId: (agentId: string) => void;
};

export function AppDialogs(props: AppDialogsProps) {
  const {
    confirmation,
    confirmationError,
    confirmInstallAgent,
    friendlyActionName,
    hitl,
    installedByDefinitionId,
    installingAgentId,
    isConfirming,
    marketplaceDetailAgent,
    marketplaceExamplePrompts,
    marketplaceTrustReasons,
    permissionProgress,
    runConfirmation,
    schemas,
    scrollToSection,
    setAgentProfileTab,
    setConfirmInstallAgent,
    setConfirmation,
    setMarketplaceDetailAgent,
    setSelectedAgentId,
    confirmMarketplaceInstall
  } = props;

  return (
    <>
      {confirmation ? (
        <ConfirmDialog
          confirmation={confirmation}
          error={confirmationError}
          isConfirming={isConfirming}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void runConfirmation()}
        />
      ) : null}
      {confirmInstallAgent ? (
        <InstallConfirmDialog
          agent={confirmInstallAgent}
          friendlyActionName={friendlyActionName}
          installingAgentId={installingAgentId}
          onCancel={() => setConfirmInstallAgent(null)}
          onConfirm={() => void confirmMarketplaceInstall()}
        />
      ) : null}
      {marketplaceDetailAgent ? (
        <MarketplaceDetailSheet
          agent={marketplaceDetailAgent}
          hitl={hitl}
          installedByDefinitionId={installedByDefinitionId}
          installingAgentId={installingAgentId}
          marketplaceExamplePrompts={marketplaceExamplePrompts}
          marketplaceTrustReasons={marketplaceTrustReasons}
          onClose={() => setMarketplaceDetailAgent(null)}
          onConfirmInstall={(agent) => {
            setConfirmInstallAgent(agent);
            setMarketplaceDetailAgent(null);
          }}
          onEditInstalledAgentAccess={(agentId: string) => {
            setSelectedAgentId(agentId);
            setMarketplaceDetailAgent(null);
            scrollToSection("clearance");
          }}
          onOpenInstalledAgent={(agentId: string) => {
            setSelectedAgentId(agentId);
            setAgentProfileTab("chat");
            setMarketplaceDetailAgent(null);
            scrollToSection("helpers");
          }}
          permissionProgress={permissionProgress}
          schemas={schemas}
        />
      ) : null}
    </>
  );
}
