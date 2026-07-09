import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Database,
  Download,
  FilePlus,
  FileSearch,
  KeyRound,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, setApiAccessToken } from "./api/client";
import { isAuthConfigured, supabase, type AuthSession } from "./api/supabaseClient";
import type { ActivityLog, Agent, AgentConversation, AgentRunResult, HitlRequest, MarketplaceAgent, UserAgentInstall, VaultDocument, VaultSchema } from "./api/types";
import { AgentProfilePanel } from "./components/AgentProfilePanel";
import { MarketplacePanel } from "./components/MarketplacePanel";
import { StatusPill } from "./components/StatusPill";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "./lib/display";
import { marketplaceCategoryMatches, marketplaceSearchValues, scoreMarketplaceAgent, type MatcherChoice, type MarketplaceFilters, type MarketplaceNeed } from "./lib/marketplaceMatching";

type RealtimeEvent = { type: string; payload: unknown };
type SectionId = "home" | "agents" | "vault" | "clearance" | "activity" | "settings";
type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
  onConfirm: () => Promise<void> | void;
};
type AgentDraft = {
  name: string;
  category: string;
  apiProtocol: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActionsText: string;
};
type VaultItemDraft = {
  title: string;
  vaultSchemaId: string;
  content: string;
};
type ChatTranscriptItem = {
  role: "user" | "agent";
  content: string;
  status?: AgentRunResult["status"] | AgentMessageStatus;
  requestId?: string;
  actionName?: string;
  provider?: AgentRunResult["provider"];
  model?: string;
  providerFallbackReason?: AgentRunResult["providerFallbackReason"];
  runtimeState?: AgentRunResult["runtimeState"];
  nextStep?: string;
  usedSchemas?: string[];
  documents?: VaultDocument[];
};
type AgentMessageStatus = "success" | "blocked_by_policy" | "pending_human_approval" | "error" | null;
type AgentProfileTab = "chat" | "permissions" | "activity" | "settings";
type AgentTemplate = {
  id: string;
  title: string;
  category: string;
  starterName: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActions: string[];
  summary: string;
};
type HelperStatusFilter = "all" | "ready" | "needs_access" | "needs_approval";
type AgentReadiness = ReturnType<typeof agentReadiness>;
type HelperPrompt = {
  label: string;
  prompt: string;
  detail: string;
  tone: "info" | "safe" | "approval";
};

const navItems: Array<{ id: SectionId; label: string; icon: typeof Bot }> = [
  { id: "home", label: "Home", icon: ShieldCheck },
  { id: "agents", label: "Find Helpers", icon: Bot },
  { id: "vault", label: "Private Info", icon: Database },
  { id: "clearance", label: "Permissions", icon: KeyRound },
  { id: "activity", label: "Receipts", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings }
];

const sectionHeadings: Record<SectionId, { title: string; description: string }> = {
  home: {
    title: "What do you want help with today?",
    description: "Find a helper, ask for help, and stay in control of what it can read or do."
  },
  agents: {
    title: "Find Helpers",
    description: "Choose helpers for travel, money, daily tasks, work, and more."
  },
  vault: {
    title: "Private Info",
    description: "Keep important notes in one place so approved helpers can use them safely."
  },
  clearance: {
    title: "Permissions",
    description: "Choose exactly which private info each helper can access."
  },
  activity: {
    title: "Receipts",
    description: "See what helpers read, what they asked for, and what was blocked."
  },
  settings: {
    title: "Settings",
    description: "Export your data, revoke access, and manage your account."
  }
};

const categoryOptions = ["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"];
const marketplaceCategoryOptions = ["All", "Travel", "Money", "Daily Tasks", "Shopping", "Health", "Work"];
const marketplaceNeedOptions: MarketplaceNeed[] = [
  { id: "travel", title: "Travel", detail: "Trips, bookings, loyalty", category: "Travel", query: "travel" },
  { id: "money", title: "Money", detail: "Budget, cards, payments", category: "Money", query: "money" },
  { id: "daily", title: "Daily Tasks", detail: "Reminders, planning, errands", category: "Daily Tasks", query: "task" },
  { id: "shopping", title: "Shopping", detail: "Compare options, subscriptions", category: "Shopping", query: "shopping" },
  { id: "health", title: "Health", detail: "Private health notes", category: "Health", query: "health" },
  { id: "work", title: "Work", detail: "Email, follow-ups, scheduling", category: "Work", query: "email" }
];
const toolOptions = ["vault.search", "action.execute", "calendar.read", "email.draft", "web.fetch"];
const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4141/ws`;
const marketplaceFilterLabels: Array<{ id: keyof MarketplaceFilters; label: string }> = [
  { id: "usesPrivateInfo", label: "Uses private info" },
  { id: "canTakeActions", label: "Can take actions" },
  { id: "needsApproval", label: "Must ask first" }
];
const helperStatusFilters: Array<{ id: HelperStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "needs_access", label: "Needs access" },
  { id: "needs_approval", label: "Needs approval" }
];
const testHelperPattern = /(smoke|test|demo|sample)/i;

const agentTemplates: AgentTemplate[] = [
  {
    id: "travel",
    title: "Travel planner",
    category: "Travel",
    starterName: "My Travel Planner",
    description: "Plans trips using my travel preferences and pauses before non-refundable bookings.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Frequent Flyer Ledger", "Personal Identity Profile"],
    highRiskActions: ["book_non_refundable_travel"],
    summary: "Good for flights, hotels, loyalty details, and trip planning."
  },
  {
    id: "money",
    title: "Money helper",
    category: "Financial",
    starterName: "My Money Helper",
    description: "Checks financial preferences and asks before purchases, transfers, or credit decisions.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Financial Preferences"],
    highRiskActions: ["transfer_funds", "open_credit_card"],
    summary: "Good for budgeting, card preferences, and payment guardrails."
  },
  {
    id: "inbox",
    title: "Inbox assistant",
    category: "Executive",
    starterName: "My Inbox Assistant",
    description: "Drafts replies and helps summarize tasks while asking before anything is sent.",
    tools: ["vault.search", "email.draft"],
    requestedSchemas: ["Personal Identity Profile"],
    highRiskActions: ["send_email", "share_personal_info"],
    summary: "Good for email drafts, follow-ups, and contact context."
  },
  {
    id: "shopping",
    title: "Shopping assistant",
    category: "Domestic",
    starterName: "My Shopping Assistant",
    description: "Uses preferences to compare options and asks before buying anything.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Financial Preferences"],
    highRiskActions: ["buy_item", "share_payment_info"],
    summary: "Good for shopping decisions without surprise purchases."
  },
  {
    id: "health",
    title: "Health organizer",
    category: "Wellness",
    starterName: "My Health Organizer",
    description: "Organizes health notes and always asks before sharing sensitive information.",
    tools: ["vault.search"],
    requestedSchemas: ["Medical History", "Personal Identity Profile"],
    highRiskActions: ["share_medical_record"],
    summary: "Good for organizing private health context with tight controls."
  },
  {
    id: "custom",
    title: "Custom agent",
    category: "Custom",
    starterName: "",
    description: "",
    tools: ["vault.search"],
    requestedSchemas: [],
    highRiskActions: [],
    summary: "Start blank and choose access yourself."
  }
];

const initialAgentDraft: AgentDraft = {
  name: "",
  category: "Custom",
  apiProtocol: "MCP",
  description: "",
  tools: ["vault.search"],
  requestedSchemas: [],
  highRiskActionsText: ""
};
const initialVaultItemDraft: VaultItemDraft = {
  title: "",
  vaultSchemaId: "",
  content: ""
};

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function parseHighRiskActions(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function friendlyTrustLabel(score: number) {
  if (score >= 90) return "Very trusted";
  if (score >= 80) return "Trusted";
  return "Safety reviewed";
}

function approvalReason(action: string) {
  const lower = action.toLowerCase();
  if (/book|reserve|travel/.test(lower)) return "This may spend money or create a non-refundable booking.";
  if (/transfer|pay|payment|credit|purchase|buy/.test(lower)) return "This may move money, make a purchase, or affect your finances.";
  if (/medical|health/.test(lower)) return "This may share sensitive health information.";
  if (/send|email|share/.test(lower)) return "This may send or share information outside your account.";
  return "This is a sensitive action, so the helper must pause for your approval.";
}

function approvalPlainSentence(action: string) {
  return `This helper wants to ${friendlyActionName(action)}.`;
}

function agentCannotDo(agent: Agent | undefined) {
  if (!agent) return ["Act without your approval"];
  const rules = ["Read private info you have not allowed"];
  if (agent.capabilityManifest.highRiskActions?.length) {
    rules.push("Continue risky actions until you approve them");
  }
  if (!agent.capabilityManifest.tools?.includes("email.draft")) {
    rules.push("Send emails from your account");
  }
  if (!agent.capabilityManifest.tools?.includes("action.execute")) {
    rules.push("Take real-world actions");
  }
  return Array.from(new Set(rules));
}

function isTestHelper(agent: Pick<Agent, "name" | "capabilityManifest">) {
  return testHelperPattern.test(agent.name) || testHelperPattern.test(agent.capabilityManifest.description ?? "");
}

function agentReadiness(agent: Agent | undefined, missingCount: number, pendingApprovalCount: number) {
  if (!agent) {
    return {
      tone: "red" as const,
      label: "No helper selected",
      detail: "Choose a helper to start."
    };
  }
  if (pendingApprovalCount > 0) {
    return {
      tone: "amber" as const,
      label: "Needs approval",
      detail: `${pendingApprovalCount} action${pendingApprovalCount === 1 ? "" : "s"} paused until you approve or deny.`
    };
  }
  if (missingCount > 0) {
    return {
      tone: "amber" as const,
      label: "Needs permission",
      detail: "Allow the requested private info before this helper can answer well."
    };
  }
  return {
    tone: "green" as const,
    label: "Ready",
    detail: "This helper can answer using only the info you approved."
  };
}

function promptSuggestions(agent: Agent | undefined): HelperPrompt[] {
  const category = agent?.category.toLowerCase() ?? "";
  if (category.includes("travel")) return [
    { label: "Check my preferences", prompt: "What travel preferences do you know about me?", detail: "Reads only approved travel notes.", tone: "info" },
    { label: "Plan safely", prompt: "Plan a weekend trip using my saved preferences", detail: "Uses saved info, no booking yet.", tone: "safe" },
    { label: "Check approval", prompt: "Book a non-refundable trip", detail: "Should pause before booking.", tone: "approval" }
  ];
  if (category.includes("financial")) return [
    { label: "Find my rule", prompt: "What spending rule should I follow?", detail: "Looks up approved money notes.", tone: "info" },
    { label: "Use preferences", prompt: "Find my payment preferences", detail: "Shows what info was used.", tone: "safe" },
    { label: "Check approval", prompt: "Transfer money for this purchase", detail: "Should pause before money moves.", tone: "approval" }
  ];
  if (category.includes("wellness")) return [
    { label: "Summarize notes", prompt: "Summarize my saved health notes", detail: "Uses approved health notes only.", tone: "info" },
    { label: "Check access", prompt: "What health info can you access?", detail: "Explains allowed private info.", tone: "safe" },
    { label: "Check approval", prompt: "Share my medical record", detail: "Should pause before sharing.", tone: "approval" }
  ];
  return [
    { label: "Start simple", prompt: "What can you help me with?", detail: "No risky action.", tone: "info" },
    { label: "Find info", prompt: "Find the private info you can use", detail: "Uses approved notes only.", tone: "safe" },
    { label: "Check approval", prompt: "Try an action that needs approval", detail: "Shows the approval pause.", tone: "approval" }
  ];
}

function promptRiskPreview(prompt: string, agent: Agent | undefined, missingPermissions: number, pendingApprovals: number) {
  const cleanPrompt = prompt.trim();
  if (pendingApprovals > 0) {
    return {
      tone: "amber" as const,
      label: "Approval waiting",
      detail: "Finish the paused approval before starting another sensitive action."
    };
  }
  if (!cleanPrompt) {
    return {
      tone: "blue" as const,
      label: "Ready when you are",
      detail: "Choose a starter or type what you want this helper to do."
    };
  }
  if (/\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open)\b/i.test(cleanPrompt)) {
    return {
      tone: "amber" as const,
      label: "Will ask first",
      detail: `${agent?.name ?? "This helper"} should pause before taking a sensitive action.`
    };
  }
  if (missingPermissions > 0) {
    return {
      tone: "amber" as const,
      label: "May need access",
      detail: "The answer may be limited until you allow the requested private info."
    };
  }
  return {
    tone: "green" as const,
    label: "Safe to send",
    detail: "This should answer using only private info you already allowed."
  };
}

function marketplaceExamplePrompts(agent: MarketplaceAgent | undefined) {
  const manifest = agent?.versions[0]?.capabilityManifest ?? {};
  if (manifest.examplePrompts?.length) return manifest.examplePrompts.slice(0, 3);
  const category = agent?.category.toLowerCase() ?? "";
  if (category.includes("travel")) return ["Plan a weekend trip", "Check my travel preferences", "Ask before booking anything"];
  if (category.includes("financial")) return ["Find my budget rules", "Compare card preferences", "Ask before moving money"];
  if (category.includes("wellness")) return ["Summarize health notes", "Check what you can access", "Ask before sharing health info"];
  if (category.includes("executive")) return ["Draft a follow-up", "Summarize my reminders", "Ask before sending"];
  return ["Find useful private info", "Help with this task", "Ask before risky actions"];
}

function marketplaceTrustReasons(agent: MarketplaceAgent | undefined) {
  const manifest = agent?.versions[0]?.capabilityManifest ?? {};
  if (manifest.trustReasons?.length) return manifest.trustReasons.slice(0, 4);
  const reasons = [
    agent?.creator?.verified ? "Verified creator profile" : "Community listing with a visible safety profile",
    "Cannot read private info until you allow it",
    "You can remove this helper or revoke access anytime"
  ];
  if (manifest.highRiskActions?.length) {
    reasons.splice(2, 0, "Must ask before sensitive actions");
  } else {
    reasons.splice(2, 0, "No listed risky actions");
  }
  return reasons;
}

function permissionProgress(agent: Agent | undefined, schemas: VaultSchema[]) {
  if (!agent) return { allowed: 0, requested: 0, missing: 0 };
  const requested = agent.capabilityManifest.requestedSchemas ?? [];
  const grantedSchemaIds = new Set(
    agent.permissions
      .filter((permission) => permission.permissionType === "read" && permission.vaultSchemaId)
      .map((permission) => permission.vaultSchemaId)
  );
  const allowed = requested.filter((schemaName) => {
    const schema = schemas.find((item) => item.name === schemaName);
    return Boolean(schema?.id && grantedSchemaIds.has(schema.id));
  }).length;
  return { allowed, requested: requested.length, missing: Math.max(requested.length - allowed, 0) };
}

function agentReadinessFor(agent: Agent | undefined, schemas: VaultSchema[], approvals: HitlRequest[]): AgentReadiness {
  const progress = permissionProgress(agent, schemas);
  const pendingCount = agent ? approvals.filter((request) => request.agent.id === agent.id).length : 0;
  return agentReadiness(agent, progress.missing, pendingCount);
}

function runtimeSummary(result: AgentRunResult | null) {
  if (!result) return null;
  if (result.runtimeState === "needs_permission") return "This helper needs permission before it can use that private info.";
  if (result.runtimeState === "needs_approval") return "This action is waiting for your approval.";
  if (result.status === "blocked") return result.reason ?? "This request was blocked by your safety rules.";
  if (result.provider === "openai") return `Answered with OpenAI${result.model ? ` (${result.model})` : ""}.`;
  if (result.provider === "local") return `Answered with the built-in safe answer service. ${friendlyFallbackReason(result.providerFallbackReason)}`;
  return "Answered with the built-in safe answer service.";
}

function friendlyFallbackReason(reason?: string) {
  const labels: Record<string, string> = {
    auth_failed: "The OpenAI key could not be authenticated.",
    config_missing: "OpenAI is not configured yet.",
    model_not_found: "The selected OpenAI model was not found.",
    openai_request_failed: "The OpenAI request failed.",
    openai_server_error: "OpenAI had a temporary server issue.",
    project_or_model_access: "This OpenAI project does not have access to the selected model.",
    quota_or_rate_limit: "OpenAI quota or rate limits need attention."
  };
  if (!reason) return "OpenAI was unavailable.";
  if (reason.startsWith("openai_http_")) return "OpenAI returned an error.";
  return labels[reason] ?? "OpenAI was unavailable.";
}

function stringArrayFromMetadata(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function vaultDocumentsFromMetadata(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const documents = value.filter((item): item is VaultDocument => (
    Boolean(item)
    && typeof item === "object"
    && typeof (item as VaultDocument).id === "string"
    && typeof (item as VaultDocument).title === "string"
  ));
  return documents.length ? documents : undefined;
}

function chatItemFromMessage(message: AgentConversation["messages"][number]): ChatTranscriptItem {
  return {
    role: message.role as "user" | "agent",
    content: message.content,
    status: message.status,
    requestId: typeof message.metadata.requestId === "string" ? message.metadata.requestId : undefined,
    actionName: typeof message.metadata.actionName === "string" ? message.metadata.actionName : undefined,
    provider: message.metadata.provider === "openai" || message.metadata.provider === "local" ? message.metadata.provider : undefined,
    model: typeof message.metadata.model === "string" ? message.metadata.model : undefined,
    providerFallbackReason: typeof message.metadata.providerFallbackReason === "string" ? message.metadata.providerFallbackReason : undefined,
    runtimeState: ["ready", "needs_permission", "needs_approval", "blocked", "failed"].includes(String(message.metadata.runtimeState))
      ? message.metadata.runtimeState as AgentRunResult["runtimeState"]
      : undefined,
    nextStep: typeof message.metadata.nextStep === "string" ? message.metadata.nextStep : undefined,
    usedSchemas: stringArrayFromMetadata(message.metadata.usedSchemas),
    documents: vaultDocumentsFromMetadata(message.metadata.documents)
  };
}

function getStarterPrompt(templateId: string) {
  const prompts: Record<string, string> = {
    travel: "Plan a weekend trip using my preferences",
    money: "Find the spending rule I should follow",
    inbox: "Draft a polite follow-up email",
    shopping: "Compare options without buying anything",
    health: "Summarize the health note I saved"
  };
  return prompts[templateId] ?? "Find the personal info this helper can use";
}

function getStarterInfoPlaceholder(templateId: string) {
  const placeholders: Record<string, string> = {
    travel: "Example: I prefer aisle seats, vegetarian meals, and hotels near public transit.",
    money: "Example: Ask me before purchases over 200 dollars. I prefer cash flow stability over rewards.",
    inbox: "Example: My usual tone is warm and brief. Never send email without my approval.",
    shopping: "Example: I prefer durable items, compare prices first, and ask me before any purchase.",
    health: "Example: Keep health notes private and ask before sharing anything with another service."
  };
  return placeholders[templateId] ?? "Add one useful preference or rule this helper should remember.";
}

function getAvailableAgentName(baseName: string, existingNames: string[]) {
  const normalized = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!normalized.has(baseName.toLowerCase())) return baseName;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!normalized.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

function friendlyLogText(log: ActivityLog) {
  const agent = log.agent?.name ?? "System";
  if (log.actionType === "vault_read") return `${agent} read personal info`;
  if (log.actionType === "vault_write") return `${agent} changed personal info`;
  if (log.actionType === "permission_requested") return log.status === "success" ? `${agent} was granted access` : `${agent} access was revoked or blocked`;
  if (log.actionType === "hitl_requested") return `${agent} asked for your approval`;
  if (log.actionType === "execution_triggered") return `${agent} tried to take an action`;
  if (log.actionType === "agent_created") return `${agent} was added`;
  if (log.actionType === "agent_removed") return `${agent} was removed`;
  if (log.actionType === "indexing_completed") return "Personal info was indexed";
  return `${agent} activity`;
}

function friendlyLogDetail(log: ActivityLog) {
  if (log.actionType === "vault_read") return `Used: ${log.dataAccessed ?? "approved private info"}`;
  if (log.actionType === "permission_requested") return log.dataAccessed ? `Info category: ${log.dataAccessed}` : "Permission changed";
  if (log.actionType === "hitl_requested") return log.dataAccessed ? `Paused action: ${friendlyActionName(log.dataAccessed)}` : "A sensitive action was paused";
  if (log.actionType === "agent_created") return log.dataAccessed ? `Helper: ${log.dataAccessed}` : "Helper added to profile";
  if (log.actionType === "agent_removed") return log.dataAccessed ? `Helper: ${log.dataAccessed}` : "Helper removed from profile";
  if (log.dataAccessed) return log.dataAccessed;
  return "No extra detail";
}

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function friendlyNotificationText(log: ActivityLog) {
  if (log.actionType !== "hitl_requested") return "";
  const status = String(log.dynamicMetadata?.notificationStatus ?? "");
  if (status === "sent") return "Email notification sent";
  if (status === "skipped") return "Email notification not configured";
  if (status === "failed") return "Email notification failed";
  return "";
}

function friendlyResult(result: Record<string, unknown>) {
  const status = String(result.status ?? "ok");
  if (status === "ok" && Array.isArray(result.documents)) return `Found ${result.documents.length} matching personal info item${result.documents.length === 1 ? "" : "s"}.`;
  if (status === "blocked") return `Blocked: ${String(result.reason ?? "this helper does not have permission.")}`;
  if (status === "awaiting_human_approval") return "Needs your approval before this action can continue.";
  if (status === "vault_item_created") return "Personal info saved.";
  if (status === "vault_item_updated") return "Personal info updated.";
  if (status === "vault_item_deleted") return "Personal info deleted.";
  if (status === "vault_file_uploaded") return "File uploaded into Personal Info.";
  return status.replace(/_/g, " ");
}

function friendlyAppError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/openai|api key|quota|billing|model/i.test(message)) return "The AI answer service needs attention. Check the OpenAI key or account limits, then try again.";
  if (/supabase|auth|jwt|session/i.test(message)) return "Your sign-in session needs a refresh. Sign in again if this keeps happening.";
  if (/failed:\s*5\d\d|render|timeout|sleep|waking/i.test(message)) return "Your helper service may be waking up. Wait a few seconds and try again.";
  if (/failed:\s*4\d\d/i.test(message)) return "This action needs a valid signed-in session. Please sign in again if it keeps happening.";
  if (/failed to fetch|network|connection/i.test(message)) return "Could not reach your helper service. Check the connection, wait a few seconds, and try again.";
  return message || "Something went wrong. Please try again.";
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isAuthConfigured);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [installedAgents, setInstalledAgents] = useState<UserAgentInstall[]>([]);
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [marketplaceCategory, setMarketplaceCategory] = useState("All");
  const [matcherNeedId, setMatcherNeedId] = useState("travel");
  const [matcherPrivateInfo, setMatcherPrivateInfo] = useState<MatcherChoice>("unsure");
  const [matcherActions, setMatcherActions] = useState<MatcherChoice>("unsure");
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>({
    usesPrivateInfo: false,
    canTakeActions: false,
    needsApproval: false
  });
  const [selectedMarketplaceAgentId, setSelectedMarketplaceAgentId] = useState("");
  const [showMobileMarketplace, setShowMobileMarketplace] = useState(false);
  const [confirmInstallAgent, setConfirmInstallAgent] = useState<MarketplaceAgent | null>(null);
  const [marketplaceDetailAgent, setMarketplaceDetailAgent] = useState<MarketplaceAgent | null>(null);
  const [helperSearch, setHelperSearch] = useState("");
  const [helperStatusFilter, setHelperStatusFilter] = useState<HelperStatusFilter>("all");
  const [pinnedAgentIds, setPinnedAgentIds] = useState<string[]>([]);
  const [hideTestHelpers, setHideTestHelpers] = useState(true);
  const [schemas, setSchemas] = useState<VaultSchema[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [hitl, setHitl] = useState<HitlRequest[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [connectionState, setConnectionState] = useState("connecting");
  const [toolResult, setToolResult] = useState<string>("No agent action yet.");
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [agentWizardStep, setAgentWizardStep] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState("travel");
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(initialAgentDraft);
  const [createAgentError, setCreateAgentError] = useState("");
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [installingAgentId, setInstallingAgentId] = useState("");
  const [marketplaceError, setMarketplaceError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [refreshError, setRefreshError] = useState("");
  const [grantingSchemaName, setGrantingSchemaName] = useState("");
  const [isAddingVaultItem, setIsAddingVaultItem] = useState(false);
  const [vaultItemDraft, setVaultItemDraft] = useState<VaultItemDraft>(initialVaultItemDraft);
  const [isCreatingVaultItem, setIsCreatingVaultItem] = useState(false);
  const [createVaultItemError, setCreateVaultItemError] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSchemaId, setSearchSchemaId] = useState("");
  const [searchResults, setSearchResults] = useState<VaultDocument[]>([]);
  const [isSearchingVault, setIsSearchingVault] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatTranscript, setChatTranscript] = useState<ChatTranscriptItem[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentRunResult, setAgentRunResult] = useState<AgentRunResult | null>(null);
  const [agentConversation, setAgentConversation] = useState<AgentConversation | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState("");
  const [agentProfileTab, setAgentProfileTab] = useState<AgentProfileTab>("chat");
  const [approvedContinuation, setApprovedContinuation] = useState<{ requestId: string; actionName: string } | null>(null);
  const grantDuration: string = "3600000";
  const [isGuidedSetupOpen, setIsGuidedSetupOpen] = useState(false);
  const [guidedSetupStep, setGuidedSetupStep] = useState(1);
  const [guidedTemplateId, setGuidedTemplateId] = useState("travel");
  const [guidedInfoText, setGuidedInfoText] = useState("");
  const [guidedSetupError, setGuidedSetupError] = useState("");
  const [isGuidedSetupSaving, setIsGuidedSetupSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationDialog | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [decidingApprovalId, setDecidingApprovalId] = useState("");

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setApiAccessToken(data.session?.access_token);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token);
      setIsAuthLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function refresh() {
    setIsRefreshing(true);
    setRefreshError("");
    try {
      const [agentData, marketplaceData, installedData, schemaData, documentData, logData, hitlData] = await Promise.all([
        apiGet<{ agents: Agent[] }>("/api/agents"),
        apiGet<{ agents: MarketplaceAgent[] }>("/api/marketplace/agents"),
        apiGet<{ installs: UserAgentInstall[] }>("/api/me/agents"),
        apiGet<{ schemas: VaultSchema[] }>("/api/vault/schemas"),
        apiGet<{ documents: VaultDocument[] }>("/api/vault/documents"),
        apiGet<{ logs: ActivityLog[] }>("/api/activity"),
        apiGet<{ requests: HitlRequest[] }>("/api/hitl")
      ]);
      setAgents(agentData.agents);
      setMarketplaceAgents(marketplaceData.agents);
      setInstalledAgents(installedData.installs);
      setSchemas(schemaData.schemas);
      setDocuments(documentData.documents);
      setLogs(logData.logs);
      setHitl(hitlData.requests);
      setSelectedAgentId((current) => current || agentData.agents[0]?.id || "");
      setSelectedMarketplaceAgentId((current) => current || marketplaceData.agents[0]?.id || "");
    } catch (error) {
      setRefreshError(friendlyAppError(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (isAuthConfigured && !session) return;

    void refresh();
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => setConnectionState("live");
    socket.onclose = () => setConnectionState("offline");
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      if (["activity.created", "vault.indexed", "hitl.requested"].includes(event.type)) void refresh();
    };
    return () => socket.close();
  }, [session]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );

  useEffect(() => {
    if (!selectedAgent?.id) {
      setAgentConversation(null);
      setChatTranscript([]);
      return;
    }
    let cancelled = false;
    setIsConversationLoading(true);
    setAgentRunResult(null);
    void apiGet<{ conversation: AgentConversation }>(`/api/me/agents/${selectedAgent.id}/conversation`)
      .then(({ conversation }) => {
        if (cancelled) return;
        setAgentConversation(conversation);
        setChatTranscript(
          conversation.messages
            .filter((message) => message.role === "user" || message.role === "agent")
            .map(chatItemFromMessage)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgentConversation(null);
        setChatTranscript([]);
      })
      .finally(() => {
        if (!cancelled) setIsConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.id]);

  const installedDefinitionIds = useMemo(
    () => new Set(installedAgents.map((install) => install.agentDefinition.id)),
    [installedAgents]
  );

  const installedByDefinitionId = useMemo(
    () => new Map(installedAgents.map((install) => [install.agentDefinition.id, install])),
    [installedAgents]
  );

  const visibleMarketplaceAgents = useMemo(() => {
    const search = marketplaceSearch.trim().toLowerCase();
    return marketplaceAgents.filter((agent) => {
      const manifest = agent.versions[0]?.capabilityManifest ?? {};
      const matchesCategory = marketplaceCategoryMatches(agent.category, marketplaceCategory);
      const matchesSearch = !search || marketplaceSearchValues(agent)
        .some((value) => value.toLowerCase().includes(search));
      const matchesPrivateInfo = !marketplaceFilters.usesPrivateInfo || Boolean(manifest.requestedSchemas?.length);
      const matchesActions = !marketplaceFilters.canTakeActions || Boolean(manifest.tools?.includes("action.execute"));
      const matchesApproval = !marketplaceFilters.needsApproval || Boolean(manifest.highRiskActions?.length);
      return matchesCategory && matchesSearch && matchesPrivateInfo && matchesActions && matchesApproval;
    });
  }, [marketplaceAgents, marketplaceCategory, marketplaceFilters, marketplaceSearch]);

  const prioritizedMarketplaceMatches = useMemo(
    () => visibleMarketplaceAgents.map((agent) => scoreMarketplaceAgent({
      agent,
      category: marketplaceCategory,
      search: marketplaceSearch.trim().toLowerCase(),
      filters: marketplaceFilters,
      privateInfo: matcherPrivateInfo,
      actions: matcherActions,
      installed: Boolean(agent.installed || installedDefinitionIds.has(agent.id))
    })).sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftInstalled = Number(Boolean(left.agent.installed || installedDefinitionIds.has(left.agent.id)));
      const rightInstalled = Number(Boolean(right.agent.installed || installedDefinitionIds.has(right.agent.id)));
      if (leftInstalled !== rightInstalled) return leftInstalled - rightInstalled;
      return left.agent.name.localeCompare(right.agent.name);
    }),
    [installedDefinitionIds, marketplaceCategory, marketplaceFilters, marketplaceSearch, matcherActions, matcherPrivateInfo, visibleMarketplaceAgents]
  );

  const prioritizedMarketplaceAgents = useMemo(
    () => prioritizedMarketplaceMatches.map((match) => match.agent),
    [prioritizedMarketplaceMatches]
  );

  const marketplaceMatchById = useMemo(
    () => new Map(prioritizedMarketplaceMatches.map((match) => [match.agent.id, match])),
    [prioritizedMarketplaceMatches]
  );

  const selectedMarketplaceAgent = useMemo(
    () => prioritizedMarketplaceAgents.find((agent) => agent.id === selectedMarketplaceAgentId) ?? prioritizedMarketplaceAgents[0],
    [prioritizedMarketplaceAgents, selectedMarketplaceAgentId]
  );

  const hasInstallableMarketplaceAgent = useMemo(
    () => prioritizedMarketplaceAgents.some((agent) => !agent.installed && !installedDefinitionIds.has(agent.id)),
    [installedDefinitionIds, prioritizedMarketplaceAgents]
  );

  const permissionReview = useMemo(() => {
    if (!selectedAgent) return [];
    const requestedSchemas = selectedAgent.capabilityManifest.requestedSchemas ?? [];
    const grantedSchemaIds = new Set(
      selectedAgent.permissions
        .filter((permission) => permission.permissionType === "read" && permission.vaultSchemaId)
        .map((permission) => permission.vaultSchemaId)
    );
    return requestedSchemas.map((schemaName) => {
      const schema = schemas.find((item) => item.name === schemaName);
      return {
        schema,
        schemaName,
        granted: Boolean(schema?.id && grantedSchemaIds.has(schema.id))
      };
    });
  }, [schemas, selectedAgent]);

  const ungrantedRequestedSchemas = useMemo(
    () => permissionReview.filter((item) => item.schema && !item.granted),
    [permissionReview]
  );

  const privacySummary = useMemo(() => ({
    account: session?.user.email ?? "Local development user",
    agents: agents.map((agent) => ({
      name: agent.name,
      category: agent.category,
      canUse: agent.capabilityManifest.tools?.map(friendlyToolName) ?? [],
      canRead: agent.capabilityManifest.requestedSchemas ?? [],
      mustAskBefore: agent.capabilityManifest.highRiskActions?.map(friendlyActionName) ?? []
    })),
    personalInfo: documents.map((document) => ({
      title: document.title,
      category: document.vaultSchema?.name ?? "Uncategorized",
      summary: document.excerpt
    })),
    recentActivity: logs.slice(0, 20).map((log) => ({
      when: log.createdAt,
      status: log.status,
      event: friendlyLogText(log),
      detail: log.dataAccessed
    }))
  }), [agents, documents, logs, session]);

  const pendingApproval = hitl[0];
  const selectedAgentApprovals = useMemo(
    () => hitl.filter((request) => request.agent.id === selectedAgent?.id),
    [hitl, selectedAgent?.id]
  );
  const allowedPermissionCount = permissionReview.filter((item) => item.granted).length;
  const readiness = agentReadiness(selectedAgent, ungrantedRequestedSchemas.length, selectedAgentApprovals.length);
  const suggestedPrompts = promptSuggestions(selectedAgent);
  const promptPreview = promptRiskPreview(chatInput, selectedAgent, ungrantedRequestedSchemas.length, selectedAgentApprovals.length);
  const selectedReadableInfo = permissionReview.filter((item) => item.granted).map((item) => item.schemaName);
  const selectedRiskyActions = selectedAgent?.capabilityManifest.highRiskActions ?? [];
  const selectedHelperTools = selectedAgent?.capabilityManifest.tools?.map(friendlyToolName) ?? [];
  const selectedCannotDo = agentCannotDo(selectedAgent);
  const selectedReadableInfoLabel = friendlyList(selectedReadableInfo, "Nothing yet");
  const selectedRiskyActionsLabel = friendlyList(selectedAgent?.capabilityManifest.highRiskActions?.map(friendlyActionName) ?? [], "No risky actions listed");
  const selectedHelperToolsLabel = friendlyList(selectedHelperTools, "Answer simple questions");
  const selectedCannotDoLabel = friendlyList(selectedCannotDo, "Nothing blocked");
  const helperNextStep = selectedAgentApprovals.length
    ? "Review the paused action below."
    : ungrantedRequestedSchemas.length
      ? "Allow only the private info this helper really needs."
      : "Send a request or pick one of the starter prompts.";
  const runSummary = runtimeSummary(agentRunResult);
  const selectedAgentLogs = useMemo(
    () => logs.filter((log) => log.agent?.id === selectedAgent?.id).slice(0, 8),
    [logs, selectedAgent?.id]
  );
  const installedAgentCards = useMemo(() => agents.map((agent) => ({
    agent,
    readiness: agentReadinessFor(agent, schemas, hitl),
    permissions: permissionProgress(agent, schemas),
    pendingApprovals: hitl.filter((request) => request.agent.id === agent.id).length
  })), [agents, hitl, schemas]);
  const visibleInstalledAgentCards = useMemo(() => {
    const search = helperSearch.trim().toLowerCase();
    return installedAgentCards
      .filter(({ agent, permissions, pendingApprovals }) => {
        const matchesSearch = !search || [
          agent.name,
          agent.category,
          agent.capabilityManifest.description,
          ...(agent.capabilityManifest.requestedSchemas ?? []),
          ...(agent.capabilityManifest.tools ?? [])
        ].some((value) => String(value ?? "").toLowerCase().includes(search));
        const matchesStatus =
          helperStatusFilter === "all"
          || (helperStatusFilter === "ready" && pendingApprovals === 0 && permissions.missing === 0)
          || (helperStatusFilter === "needs_access" && permissions.missing > 0 && pendingApprovals === 0)
          || (helperStatusFilter === "needs_approval" && pendingApprovals > 0);
        const matchesTestVisibility = !hideTestHelpers || !isTestHelper(agent);
        return matchesSearch && matchesStatus && matchesTestVisibility;
      })
      .sort((left, right) => {
        const leftPinned = pinnedAgentIds.includes(left.agent.id) ? 1 : 0;
        const rightPinned = pinnedAgentIds.includes(right.agent.id) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftTest = isTestHelper(left.agent) ? 1 : 0;
        const rightTest = isTestHelper(right.agent) ? 1 : 0;
        if (leftTest !== rightTest) return leftTest - rightTest;
        if (left.pendingApprovals !== right.pendingApprovals) return right.pendingApprovals - left.pendingApprovals;
        if (left.permissions.missing !== right.permissions.missing) return right.permissions.missing - left.permissions.missing;
        return left.agent.name.localeCompare(right.agent.name);
      });
  }, [helperSearch, helperStatusFilter, hideTestHelpers, installedAgentCards, pinnedAgentIds]);
  const hiddenTestHelperCount = useMemo(
    () => installedAgentCards.filter(({ agent }) => isTestHelper(agent)).length,
    [installedAgentCards]
  );
  useEffect(() => {
    if (!hideTestHelpers || !selectedAgent || !isTestHelper(selectedAgent)) return;
    const nextVisibleAgent = visibleInstalledAgentCards[0]?.agent;
    if (nextVisibleAgent) {
      setSelectedAgentId(nextVisibleAgent.id);
    }
  }, [hideTestHelpers, selectedAgent, visibleInstalledAgentCards]);
  const mobileInstalledAgentCards = installedAgentCards.slice(0, 5);
  const visibleApprovals = hitl.slice(0, 3);
  const permissionCenterRows = useMemo(() => schemas.map((schema) => ({
    schema,
    allowedAgents: agents.filter((agent) => agent.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read")),
    requestingAgents: agents.filter((agent) => (agent.capabilityManifest.requestedSchemas ?? []).includes(schema.name))
  })), [agents, schemas]);
  const heading = sectionHeadings[activeSection];
  const sectionClass = (section: SectionId) => activeSection === section ? "is-section-active" : "";
  const activeMobileClass = (section: SectionId) => activeSection === section ? "is-mobile-active" : "";
  const guidedTemplates = agentTemplates.filter((template) => template.id !== "custom");
  const guidedTemplate = guidedTemplates.find((template) => template.id === guidedTemplateId) ?? guidedTemplates[0];
  const guidedAgentName = getAvailableAgentName(guidedTemplate.starterName, agents.map((agent) => agent.name));
  const guidedSchema = schemas.find((schema) => schema.name === guidedTemplate.requestedSchemas[0]);
  const guidedPrompt = getStarterPrompt(guidedTemplate.id);
  const visibleAgents = agents.slice(0, 8);
  const visibleDocuments = documents.slice(0, 10);
  const recentLogs = logs.slice(0, 6);
  const homeActivity = logs.slice(0, 3);
  const setupSteps = [
    {
      label: "Add helper",
      detail: agents.length ? `${agents.length} ready to configure` : "Pick your first AI helper",
      done: agents.length > 0
    },
    {
      label: "Add private info",
      detail: documents.length ? `${documents.length} saved notes` : "Save one useful note",
      done: documents.length > 0
    },
    {
      label: "Approve access",
      detail: ungrantedRequestedSchemas.length ? `${ungrantedRequestedSchemas.length} requests to review` : "Only share what you allow",
      done: agents.length > 0 && ungrantedRequestedSchemas.length === 0
    },
    {
      label: "Use helper",
      detail: selectedAgent ? "Send a first request" : "Choose a helper to start",
      done: Boolean(selectedAgent && chatTranscript.length > 0)
    }
  ];
  const setupProgress = setupSteps.filter((step) => step.done).length;
  const primarySetupLabel = agents.length === 0
    ? "Start guided setup"
    : documents.length === 0
      ? "Add private info"
      : ungrantedRequestedSchemas.length > 0
        ? "Review access"
        : selectedAgent
          ? "Use selected helper"
          : "Find Helpers";

  async function togglePermission(schema: VaultSchema, enabled: boolean) {
    if (!selectedAgent) return;
    await apiPost("/api/permissions/clearance", {
      agentId: selectedAgent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled,
      restrictionRules: { deniedPaths: [], maxRecords: 8, uiGranted: true },
      expiresAt: enabled && grantDuration !== "always" ? new Date(Date.now() + Number(grantDuration)).toISOString() : undefined
    });
    await refresh();
  }

  async function grantRequestedSchema(schema: VaultSchema) {
    setGrantingSchemaName(schema.name);
    try {
      await togglePermission(schema, true);
      setToolResult(`${selectedAgent?.name ?? "This helper"} can now read ${schema.name}.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function grantAllRequestedSchemas() {
    if (ungrantedRequestedSchemas.length === 0) return;
    setGrantingSchemaName("all");
    try {
      for (const item of ungrantedRequestedSchemas) {
        if (item.schema) await togglePermission(item.schema, true);
      }
      setToolResult(`${selectedAgent?.name ?? "This helper"} can now read ${ungrantedRequestedSchemas.length} approved info categories.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  function runPrimarySetupAction() {
    if (agents.length === 0) {
      openGuidedSetup();
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
    scrollToSection("agents");
    setAgentProfileTab("chat");
  }

  async function runVaultSearch() {
    if (!selectedAgent) return;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "vault.search",
      arguments: { query: "travel preferences and approval thresholds", schema: selectedAgent.capabilityManifest.requestedSchemas?.[0] }
    });
    setToolResult(friendlyResult(result as Record<string, unknown>));
    await refresh();
  }

  async function triggerHighRiskAction() {
    if (!selectedAgent) return;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "action.execute",
      arguments: { actionName: "book_non_refundable_travel", amountUsd: 640, destination: "Berlin" }
    });
    setToolResult(friendlyResult(result as Record<string, unknown>));
    await refresh();
  }

  async function reindexVault() {
    await apiPost("/api/vault/reindex");
    setToolResult("Personal info refreshed and indexed.");
    await refresh();
  }

  async function searchVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) return;
    setIsSearchingVault(true);
    try {
      const schema = schemas.find((item) => item.id === searchSchemaId);
      const result = await apiPost<{ status: string; documents?: VaultDocument[]; reason?: string }>("/api/mcp/tool-call", {
        agentId: selectedAgent.id,
        toolName: "vault.search",
        arguments: { query: searchQuery, schema: schema?.name }
      });
      setSearchResults(result.documents ?? []);
      setToolResult(friendlyResult(result as Record<string, unknown>));
      await refresh();
    } finally {
      setIsSearchingVault(false);
    }
  }

  async function submitAgentPrompt(prompt: string) {
    if (!selectedAgent || !prompt.trim()) return;
    const cleanPrompt = prompt.trim();
    setChatTranscript((current) => [...current, { role: "user", content: cleanPrompt }]);
    setChatInput("");
    setIsAgentRunning(true);
    setAgentRunResult(null);
    setLastFailedPrompt("");
    try {
      const result = await apiPost<AgentRunResult>(`/api/me/agents/${selectedAgent.id}/run`, { message: cleanPrompt });
      setAgentRunResult(result);
      if (result.conversation) {
        setAgentConversation(result.conversation);
        setChatTranscript(
          result.conversation.messages
            .filter((message) => message.role === "user" || message.role === "agent")
            .map(chatItemFromMessage)
        );
      } else {
        setChatTranscript((current) => [...current, {
          role: "agent",
          content: result.reply,
          status: result.status,
          requestId: result.requestId,
          actionName: result.actionName,
          provider: result.provider,
          model: result.model,
          providerFallbackReason: result.providerFallbackReason,
          runtimeState: result.runtimeState,
          nextStep: result.nextStep,
          usedSchemas: result.usedSchemas,
          documents: result.documents
        }]);
      }
      setToolResult(result.reply);
      if (result.documents?.length) setSearchResults(result.documents);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed.";
      setChatTranscript((current) => [...current, { role: "agent", content: `Something went wrong. ${message}`, status: "error" }]);
      setToolResult(message);
      setLastFailedPrompt(cleanPrompt);
    } finally {
      setIsAgentRunning(false);
    }
  }

  async function runAgentChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAgentPrompt(chatInput);
  }

  async function createVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setIsAddingVaultItem(false);
      setToolResult(`${result.document.title} was saved to Personal Info.`);
      await refresh();
      scrollToSection("vault");
    } catch (error) {
      setCreateVaultItemError(friendlyAppError(error));
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  async function saveVaultEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocumentId) return;
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPut<{ document: VaultDocument }>(`/api/vault/documents/${editingDocumentId}`, {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setEditingDocumentId("");
      setIsAddingVaultItem(false);
      setToolResult(`${result.document.title} was updated.`);
      await refresh();
    } catch (error) {
      setCreateVaultItemError(friendlyAppError(error));
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  function beginEditVaultItem(document: VaultDocument) {
    setEditingDocumentId(document.id);
    setVaultItemDraft({
      title: document.title,
      vaultSchemaId: document.vaultSchema?.id ?? "",
      content: String(document.frontmatter.content ?? document.excerpt)
    });
    setIsAddingVaultItem(true);
    scrollToSection("vault");
  }

  function deleteVaultItem(document: VaultDocument) {
    setConfirmation({
      title: "Delete private info?",
      message: `Delete "${document.title}"? Your helpers will no longer be able to use this note.`,
      confirmLabel: "Delete note",
      tone: "danger",
      onConfirm: async () => {
        await apiDelete(`/api/vault/documents/${document.id}`);
        setToolResult(`${document.title} was deleted from Private Info.`);
        await refresh();
      }
    });
  }

  async function uploadVaultFile(event: FormEvent) {
    const input = event.currentTarget as unknown as {
      files?: { [index: number]: { name: string; text: () => Promise<string> } | undefined };
      value: string;
    };
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!/(\.txt|\.md)$/i.test(file.name)) {
      setToolResult("Upload blocked: this MVP supports .txt and .md files.");
      return;
    }
    const content = await file.text();
    const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
      title: file.name.replace(/\.(txt|md)$/i, ""),
      vaultSchemaId: searchSchemaId || null,
      content
    });
    setToolResult(`${result.document.title} was uploaded to Personal Info.`);
    await refresh();
    scrollToSection("vault");
  }

  async function decideHitl(id: string, approved: boolean) {
    setDecidingApprovalId(id);
    try {
      await apiPost(`/api/hitl/${id}/decision`, { approved });
      const approvedRequest = selectedAgentApprovals.find((request) => request.id === id);
      const message = approved ? "Approved. The agent can continue when you ask it to proceed." : "Denied. The agent will not continue this action.";
      if (approved && approvedRequest) {
        setApprovedContinuation({ requestId: id, actionName: approvedRequest.actionName });
      } else if (!approved) {
        setApprovedContinuation((current) => current?.requestId === id ? null : current);
      }
      setToolResult(message);
      setAgentRunResult((current) => current?.requestId === id
        ? {
          ...current,
          status: approved ? "ok" : "blocked",
          runtimeState: approved ? "ready" : "blocked",
          nextStep: approved ? "The approval was recorded. Continue the approved action when ready." : "The action was denied and will not continue.",
          reply: message
        }
        : current);
      setChatTranscript((current) => current.map((item) => item.requestId === id
        ? {
          ...item,
          status: approved ? "success" : "blocked_by_policy",
          content: message,
          nextStep: approved ? "Continue the approved action when ready." : "This action was denied.",
          actionName: item.actionName ?? approvedRequest?.actionName
        }
        : item));
      await refresh();
    } finally {
      setDecidingApprovalId("");
    }
  }

  async function continueApprovedAction(actionName: string) {
    await submitAgentPrompt(`Continue the approved action: ${actionName}`);
    setApprovedContinuation(null);
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAgentError("");
    setIsCreatingAgent(true);
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: agentDraft.name,
        category: agentDraft.category,
        apiProtocol: agentDraft.apiProtocol,
        description: agentDraft.description,
        tools: agentDraft.tools,
        requestedSchemas: agentDraft.requestedSchemas,
        highRiskActions: parseHighRiskActions(agentDraft.highRiskActionsText)
      });
      setAgentDraft(initialAgentDraft);
      setIsAddingAgent(false);
      setSelectedAgentId(result.agent.id);
      setToolResult(`${result.agent.name} was added. Review its permissions before granting access.`);
      await refresh();
      setSelectedAgentId(result.agent.id);
      scrollToSection("agents");
    } catch (error) {
      setCreateAgentError(friendlyAppError(error));
    } finally {
      setIsCreatingAgent(false);
    }
  }

  async function installMarketplaceAgent(agent: MarketplaceAgent) {
    setMarketplaceError("");
    setInstallingAgentId(agent.id);
    try {
      const result = await apiPost<{ install: UserAgentInstall }>(`/api/marketplace/agents/${agent.id}/install`, {
        displayName: agent.name
      });
      await refresh();
      const installedAgentId = result.install.agent?.id;
      if (installedAgentId) setSelectedAgentId(installedAgentId);
      setToolResult(`${result.install.displayName} was added to your profile. Review its permissions before giving access.`);
      setActiveSection("agents");
      setShowMobileMarketplace(false);
      return true;
    } catch (error) {
      setMarketplaceError(friendlyAppError(error));
      return false;
    } finally {
      setInstallingAgentId("");
    }
  }

  async function confirmMarketplaceInstall() {
    if (!confirmInstallAgent) return;
    const installed = await installMarketplaceAgent(confirmInstallAgent);
    if (installed) setConfirmInstallAgent(null);
  }

  function applyMarketplaceMatcher() {
    const need = marketplaceNeedOptions.find((item) => item.id === matcherNeedId) ?? marketplaceNeedOptions[0];
    setMarketplaceCategory(need.category);
    setMarketplaceSearch(need.query);
    setMarketplaceFilters({
      usesPrivateInfo: matcherPrivateInfo === "yes",
      canTakeActions: matcherActions === "yes",
      needsApproval: matcherActions === "yes"
    });
    setSelectedMarketplaceAgentId("");
  }

  function removeAgentFromProfile(agent: Agent) {
    setConfirmation({
      title: "Remove this helper?",
      message: `${agent.name} will be removed from your profile and lose access to your private info. Your saved private notes stay safe.`,
      confirmLabel: "Remove helper",
      tone: "danger",
      onConfirm: async () => {
        await apiDelete(`/api/agents/${agent.id}`);
        setToolResult(`${agent.name} was removed from your profile.`);
        setSelectedAgentId((current) => current === agent.id ? "" : current);
        await refresh();
      }
    });
  }

  function updateAgentDraft(patch: Partial<AgentDraft>) {
    setAgentDraft((current) => ({ ...current, ...patch }));
  }

  function applyAgentTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    setAgentDraft({
      name: template.starterName,
      category: template.category,
      apiProtocol: "MCP",
      description: template.description,
      tools: template.tools,
      requestedSchemas: template.requestedSchemas,
      highRiskActionsText: template.highRiskActions.join(", ")
    });
  }

  function openAgentWizard() {
    const template = agentTemplates.find((item) => item.id === selectedTemplateId) ?? agentTemplates[0];
    applyAgentTemplate(template);
    setCreateAgentError("");
    setAgentWizardStep(1);
    setIsAddingAgent(true);
    setShowMobileMarketplace(false);
  }

  function openMarketplace() {
    setActiveSection("agents");
    setShowMobileMarketplace(true);
    setIsAddingAgent(false);
    setIsGuidedSetupOpen(false);
    setIsAddingVaultItem(false);
    setMarketplaceError("");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function openMarketplaceDetails(agent: MarketplaceAgent) {
    setSelectedMarketplaceAgentId(agent.id);
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMarketplaceDetailAgent(agent);
    }
  }

  function togglePinnedAgent(agentId: string) {
    setPinnedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [agentId, ...current]
    );
  }

  function openGuidedSetup(templateId = guidedTemplateId) {
    setGuidedTemplateId(templateId);
    setGuidedSetupStep(1);
    setGuidedInfoText("");
    setGuidedSetupError("");
    setIsAddingAgent(false);
    setIsAddingVaultItem(false);
    setIsGuidedSetupOpen(true);
  }

  async function completeGuidedSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuidedSetupError("");
    setIsGuidedSetupSaving(true);
    setActiveSection("clearance");
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: guidedAgentName,
        category: guidedTemplate.category,
        apiProtocol: "MCP",
        description: guidedTemplate.description,
        tools: guidedTemplate.tools,
        requestedSchemas: guidedTemplate.requestedSchemas,
        highRiskActions: guidedTemplate.highRiskActions
      });

      if (guidedInfoText.trim().length >= 10) {
        await apiPost("/api/vault/documents", {
          title: `${guidedTemplate.title} starter note`,
          vaultSchemaId: guidedSchema?.id ?? null,
          content: guidedInfoText.trim()
        });
      }

      await refresh();
      setSelectedAgentId(result.agent.id);
      setChatInput(guidedPrompt);
      setToolResult(`${result.agent.name} is ready. Review the requested info, then try: "${guidedPrompt}"`);
      setIsGuidedSetupOpen(false);
      setGuidedSetupStep(1);
      setGuidedInfoText("");
    } catch (error) {
      setGuidedSetupError(friendlyAppError(error));
    } finally {
      setIsGuidedSetupSaving(false);
    }
  }

  async function revokeSelectedAgentAccessNow() {
    if (!selectedAgent) return;
    const readPermissions = selectedAgent.permissions.filter((permission) => permission.vaultSchema);
    for (const permission of readPermissions) {
      if (permission.vaultSchema) await togglePermission(permission.vaultSchema, false);
    }
    setToolResult(`All readable personal info access was revoked for ${selectedAgent.name}.`);
  }

  function revokeSelectedAgentAccess() {
    if (!selectedAgent) return;
    setConfirmation({
      title: "Revoke this helper's access?",
      message: `${selectedAgent.name} will lose access to every private info category you allowed.`,
      confirmLabel: "Revoke access",
      tone: "danger",
      onConfirm: revokeSelectedAgentAccessNow
    });
  }

  async function revokeAllAgentAccessNow() {
    for (const agent of agents) {
      for (const permission of agent.permissions.filter((item) => item.vaultSchema)) {
        if (permission.vaultSchema) {
          await apiPost("/api/permissions/clearance", {
            agentId: agent.id,
            vaultSchemaId: permission.vaultSchema.id,
            permissionType: "read",
            enabled: false,
            restrictionRules: {}
          });
        }
      }
    }
    await refresh();
    setToolResult("All helper access to Private Info was revoked.");
  }

  function revokeAllAgentAccess() {
    setConfirmation({
      title: "Revoke all helper access?",
      message: "Every helper will lose access to every private info category. You can grant access again later.",
      confirmLabel: "Revoke all access",
      tone: "danger",
      onConfirm: revokeAllAgentAccessNow
    });
  }

  function exportMyData() {
    const blob = new window.Blob([JSON.stringify(privacySummary, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ai-agent-hub-export.json";
    anchor.click();
    window.URL.revokeObjectURL(url);
    setToolResult("Your workspace export was downloaded.");
  }

  function updateVaultItemDraft(patch: Partial<VaultItemDraft>) {
    setVaultItemDraft((current) => ({ ...current, ...patch }));
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function runConfirmation() {
    if (!confirmation) return;
    setIsConfirming(true);
    try {
      await confirmation.onConfirm();
      setConfirmation(null);
    } finally {
      setIsConfirming(false);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthMessage("");
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setAuthMessage("Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not send sign-in link.");
    } finally {
      setIsSendingMagicLink(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setApiAccessToken("");
    setSession(null);
  }

  if (isAuthConfigured && isAuthLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
          <h1>Opening your workspace</h1>
          <p>Checking your private session.</p>
        </section>
      </main>
    );
  }

  if (isAuthConfigured && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
          <h1>Find your AI helpers</h1>
          <p>Add a travel helper, money helper, or daily-task helper. You decide what each one can see.</p>
          <div className="auth-trust-list" aria-label="Privacy promises">
            <span><ShieldCheck size={15} /> Private by default</span>
            <span><KeyRound size={15} /> You approve access</span>
            <span><Activity size={15} /> Receipts stay visible</span>
          </div>
          <form className="auth-form" onSubmit={(event) => void sendMagicLink(event)}>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <button disabled={isSendingMagicLink} type="submit">
              <Mail size={16} /> {isSendingMagicLink ? "Sending..." : "Send magic link"}
            </button>
          </form>
          {authMessage ? <p className="auth-message">{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              aria-current={activeSection === id ? "page" : undefined}
              className={activeSection === id ? "nav-active" : ""}
              key={id}
              onClick={() => scrollToSection(id)}
              type="button"
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>
          <div className="topbar-actions">
            <span className={`connection-status ${connectionState === "live" ? "is-live" : "is-syncing"}`} title={`Connection: ${connectionState}`}>
              <span className="connection-dot" />
              <span className="connection-text">{connectionState === "live" ? "live" : "syncing"}</span>
            </span>
            {session ? <span className="user-chip">{session.user.email}</span> : null}
            <button className="topbar-primary" onClick={openMarketplace} type="button"><Bot size={16} /> Find a Helper</button>
            <button className="topbar-secondary" onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Private Info</button>
            {session ? <button className="topbar-secondary" onClick={() => void signOut()} type="button"><LogOut size={16} /> Sign out</button> : null}
          </div>
        </header>

        <section className={`mobile-home ${activeSection === "home" ? "is-mobile-home-active" : ""}`} aria-label="Mobile overview">
          <div className="mobile-home-card">
            <span className="mobile-label">Your helper hub</span>
            <h2>What do you want help with?</h2>
            <p>Pick a helper, ask a question, and approve anything important before it continues.</p>
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
              <button onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Private Info</button>
            </div>
          </div>
          {pendingApproval ? (
            <button className="mobile-alert-card" onClick={() => scrollToSection("clearance")} type="button">
              <span>Needs your approval</span>
              <strong>{pendingApproval.agent.name}</strong>
              <small>{friendlyActionName(pendingApproval.actionName)}</small>
            </button>
          ) : null}
        </section>

        <section className={`home-dashboard desktop-section ${sectionClass("home")}`} id="home">
          <div className="panel home-card home-primary-card">
            <div className="panel-title">Start Here</div>
            <h2>Find a helper for the thing you need done.</h2>
            <p>Choose a helper for travel, money, daily tasks, work, or shopping. Helpers start private, and you approve what they can read or do.</p>
            <div className="home-category-grid" aria-label="Common helper categories">
              {guidedTemplates.slice(0, 5).map((template) => (
                <button key={template.id} onClick={() => openGuidedSetup(template.id)} type="button">
                  <Bot size={16} />
                  <span>{template.title}</span>
                  <small>{template.summary}</small>
                </button>
              ))}
            </div>
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
            <div className="button-row">
              <button className="primary-action" onClick={runPrimarySetupAction} type="button"><Bot size={16} /> {primarySetupLabel}</button>
              <button onClick={() => scrollToSection("clearance")} type="button"><KeyRound size={16} /> Review permissions</button>
            </div>
          </div>

          <div className="panel home-card">
            <div className="panel-title">My Helpers</div>
            {visibleAgents.slice(0, 3).map((agent) => (
              <button
                className="home-list-button"
                key={`home-${agent.id}`}
                onClick={() => {
                  setSelectedAgentId(agent.id);
                  scrollToSection("agents");
                }}
                type="button"
              >
                <span>{agent.name}</span>
                <small>{agent.category} / {friendlyTrustLabel(agent.trustScore)}</small>
              </button>
            ))}
            {agents.length === 0 ? <p className="empty">Create your first helper to get started.</p> : null}
          </div>

          <div className="panel home-card">
            <div className="panel-title">What Needs You</div>
            {pendingApproval ? (
              <button className="home-list-button alert" onClick={() => scrollToSection("clearance")} type="button">
                <span>{pendingApproval.agent.name} needs approval</span>
                <small>{friendlyActionName(pendingApproval.actionName)}</small>
              </button>
            ) : (
              <p className="empty">No approvals waiting. You are all clear.</p>
            )}
          </div>

          <div className="panel home-card home-wide-card">
            <div className="panel-title">Recent Receipts</div>
            {homeActivity.length ? homeActivity.map((log) => (
              <div className="log-row compact-log-row" key={`home-log-${log.id}`}>
                <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>
                  {log.status === "success" ? "done" : log.status === "pending_human_approval" ? "needs approval" : "blocked"}
                </StatusPill>
                <span>{friendlyLogText(log)}</span>
              </div>
            )) : <p className="empty">Receipts appear when helpers read info, ask approval, or get blocked.</p>}
          </div>
        </section>

        {isGuidedSetupOpen ? (
          <form className="panel guided-setup-panel" onSubmit={(event) => void completeGuidedSetup(event)}>
            <div className="guided-setup-head">
              <div>
                <div className="panel-title">Guided Setup</div>
                <h2>{guidedSetupStep === 1 ? "What should your helper do?" : guidedSetupStep === 2 ? "Add one helpful private note" : "Ready to create your helper"}</h2>
              </div>
              <div className="wizard-steps" aria-label="Guided setup progress">
                {[1, 2, 3].map((step) => (
                  <button className={guidedSetupStep === step ? "step-active" : ""} key={step} onClick={() => setGuidedSetupStep(step)} type="button">
                    {step}
                  </button>
                ))}
              </div>
            </div>

            {guidedSetupStep === 1 ? (
              <section className="wizard-page">
                <div className="template-grid guided-template-grid">
                  {guidedTemplates.map((template) => (
                    <button
                      className={guidedTemplateId === template.id ? "template-card selected" : "template-card"}
                      key={template.id}
                      onClick={() => setGuidedTemplateId(template.id)}
                      type="button"
                    >
                      <strong>{template.title}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {guidedSetupStep === 2 ? (
              <section className="wizard-page">
                <p className="guided-copy">
                  This stays in your Personal Info. Your new helper will still need permission before reading it.
                </p>
                <label className="risk-field">
                  <span>{guidedSchema ? `${guidedSchema.name} note` : "Private note"}</span>
                  <textarea
                    onChange={(event) => setGuidedInfoText(event.currentTarget.value)}
                    placeholder={getStarterInfoPlaceholder(guidedTemplate.id)}
                    rows={5}
                    value={guidedInfoText}
                  />
                </label>
              </section>
            ) : null}

            {guidedSetupStep === 3 ? (
              <section className="wizard-page">
                <div className="guided-review">
                  <div><strong>Helper</strong><span>{guidedAgentName}</span></div>
                  <div><strong>Can request</strong><span>{guidedTemplate.requestedSchemas.join(", ") || "Nothing yet"}</span></div>
                  <div><strong>Must ask before</strong><span>{guidedTemplate.highRiskActions.map(friendlyActionName).join(", ") || "No risky actions"}</span></div>
                  <div><strong>First thing to try</strong><span>{guidedPrompt}</span></div>
                </div>
                <p className="guided-copy">
                  After this, review the permission request. You stay in control before the helper reads private info or continues a risky action.
                </p>
              </section>
            ) : null}

            {guidedSetupError ? <p className="error-text">{guidedSetupError}</p> : null}
            <div className="button-row">
              {guidedSetupStep > 1 ? <button onClick={() => setGuidedSetupStep((step) => step - 1)} type="button">Back</button> : null}
              {guidedSetupStep < 3 ? <button onClick={() => setGuidedSetupStep((step) => step + 1)} type="button">Next</button> : null}
              {guidedSetupStep === 3 ? (
                <button disabled={isGuidedSetupSaving} type="submit"><Bot size={16} /> {isGuidedSetupSaving ? "Creating..." : "Create helper"}</button>
              ) : null}
              <button onClick={() => setIsGuidedSetupOpen(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        {isAddingAgent ? (
          <form className="panel add-agent-panel" onSubmit={(event) => void createAgent(event)}>
            <div className="panel-title">Add an AI Agent</div>
            <div className="wizard-steps" aria-label="Agent setup progress">
              {[1, 2, 3, 4].map((step) => (
                <button className={agentWizardStep === step ? "step-active" : ""} key={step} onClick={() => setAgentWizardStep(step)} type="button">
                  {step}
                </button>
              ))}
            </div>

            {agentWizardStep === 1 ? (
              <section className="wizard-page">
                <h2>What kind of helper do you want?</h2>
                <div className="template-grid">
                  {agentTemplates.map((template) => (
                    <button
                      className={selectedTemplateId === template.id ? "template-card selected" : "template-card"}
                      key={template.id}
                      onClick={() => applyAgentTemplate(template)}
                      type="button"
                    >
                      <strong>{template.title}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {agentWizardStep === 2 ? (
              <section className="wizard-page">
                <h2>Name and describe it</h2>
                <div className="form-grid consumer-form-grid">
                  <label>
                    <span>Agent name</span>
                    <input
                      maxLength={80}
                      name="agent-name"
                      onChange={(event) => updateAgentDraft({ name: event.currentTarget.value })}
                      placeholder="My Travel Planner"
                      required
                      value={agentDraft.name}
                    />
                  </label>
                  <label>
                    <span>Agent type</span>
                    <select onChange={(event) => updateAgentDraft({ category: event.currentTarget.value })} value={agentDraft.category}>
                      {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="wide-field">
                    <span>What should it help with?</span>
                    <textarea
                      maxLength={500}
                      minLength={10}
                      name="agent-description"
                      onChange={(event) => updateAgentDraft({ description: event.currentTarget.value })}
                      placeholder="Plans trips using my preferences and asks before booking."
                      required
                      rows={3}
                      value={agentDraft.description}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {agentWizardStep === 3 ? (
              <section className="wizard-page">
                <h2>Choose what it can access</h2>
                <div className="choice-grid consumer-choice-grid">
                  <fieldset>
                    <legend>Personal info this agent can request</legend>
                    {schemas.map((schema) => (
                      <label className="choice-row" key={schema.id}>
                        <input
                          checked={agentDraft.requestedSchemas.includes(schema.name)}
                          onChange={() => updateAgentDraft({ requestedSchemas: toggleListValue(agentDraft.requestedSchemas, schema.name) })}
                          type="checkbox"
                        />
                        <span>{schema.name}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>What it may do</legend>
                    {toolOptions.map((tool) => (
                      <label className="choice-row" key={tool}>
                        <input
                          checked={agentDraft.tools.includes(tool)}
                          onChange={() => updateAgentDraft({ tools: toggleListValue(agentDraft.tools, tool) })}
                          type="checkbox"
                        />
                        <span>{friendlyToolName(tool)}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </section>
            ) : null}

            {agentWizardStep === 4 ? (
              <section className="wizard-page">
                <h2>Set approval rules</h2>
                <label className="risk-field">
                  <span>Ask me before</span>
                  <textarea
                    onChange={(event) => updateAgentDraft({ highRiskActionsText: event.currentTarget.value })}
                    placeholder="Buying, booking, sending, or sharing anything important"
                    rows={4}
                    value={agentDraft.highRiskActionsText}
                  />
                </label>
                <div className="review-strip">
                  <div><strong>Connection</strong><span>Starts restricted</span></div>
                  <div><strong>Can request</strong><span>{agentDraft.requestedSchemas.length} info categories</span></div>
                  <div><strong>Approval rules</strong><span>{parseHighRiskActions(agentDraft.highRiskActionsText).length} rules</span></div>
                </div>
              </section>
            ) : null}

            {createAgentError ? <p className="error-text">{createAgentError}</p> : null}
            <div className="button-row">
              {agentWizardStep > 1 ? <button onClick={() => setAgentWizardStep((step) => step - 1)} type="button">Back</button> : null}
              {agentWizardStep < 4 ? <button onClick={() => setAgentWizardStep((step) => step + 1)} type="button">Next</button> : null}
              {agentWizardStep === 4 ? (
                <button disabled={isCreatingAgent} type="submit"><Bot size={16} /> {isCreatingAgent ? "Adding..." : "Add agent"}</button>
              ) : null}
              <button onClick={() => setIsAddingAgent(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        {isAddingVaultItem ? (
          <form className="panel add-vault-panel" onSubmit={(event) => editingDocumentId ? void saveVaultEdit(event) : void createVaultItem(event)}>
            <div className="panel-title">{editingDocumentId ? "Edit Personal Info" : "Add Personal Info"}</div>
            <div className="form-grid vault-form-grid">
              <label>
                <span>Title</span>
                <input
                  maxLength={120}
                  name="private-info-title"
                  onChange={(event) => updateVaultItemDraft({ title: event.currentTarget.value })}
                  placeholder="Travel meal preferences"
                  required
                  value={vaultItemDraft.title}
                />
              </label>
              <label>
                <span>Category</span>
                <select
                  name="private-info-category"
                  onChange={(event) => updateVaultItemDraft({ vaultSchemaId: event.currentTarget.value })}
                  value={vaultItemDraft.vaultSchemaId}
                >
                  <option value="">Uncategorized</option>
                  {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
                </select>
              </label>
              <label className="wide-field">
                <span>Private note</span>
                <textarea
                  maxLength={5000}
                  minLength={10}
                  name="private-info-note"
                  onChange={(event) => updateVaultItemDraft({ content: event.currentTarget.value })}
                  placeholder="I prefer aisle seats, vegetarian meals, and Star Alliance when possible."
                  required
                  rows={4}
                  value={vaultItemDraft.content}
                />
              </label>
            </div>
            {createVaultItemError ? <p className="error-text">{createVaultItemError}</p> : null}
            <div className="button-row">
              <button disabled={isCreatingVaultItem} type="submit">
                <FilePlus size={16} /> {isCreatingVaultItem ? "Saving..." : editingDocumentId ? "Update info" : "Save info"}
              </button>
              <button onClick={() => {
                setIsAddingVaultItem(false);
                setEditingDocumentId("");
                setVaultItemDraft(initialVaultItemDraft);
              }} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        <section className={`grid workspace-grid section-${activeSection} ${agents.length ? "has-helpers" : "has-no-helpers"} ${showMobileMarketplace ? "show-mobile-marketplace" : ""}`}>
          <MarketplacePanel
            className={`panel marketplace-panel mobile-section desktop-section ${activeMobileClass("agents")} ${sectionClass("agents")}`}
            formatError={friendlyAppError}
            getPermissionProgress={permissionProgress}
            hasInstallableMarketplaceAgent={hasInstallableMarketplaceAgent}
            hitl={hitl}
            installedByDefinitionId={installedByDefinitionId}
            installedCount={installedAgents.length}
            installedDefinitionIds={installedDefinitionIds}
            installingAgentId={installingAgentId}
            isRefreshing={isRefreshing}
            marketplaceAgentCount={marketplaceAgents.length}
            marketplaceCategory={marketplaceCategory}
            marketplaceCategoryOptions={marketplaceCategoryOptions}
            marketplaceError={marketplaceError}
            marketplaceExamplePrompts={marketplaceExamplePrompts}
            marketplaceFilterLabels={marketplaceFilterLabels}
            marketplaceFilters={marketplaceFilters}
            marketplaceMatchById={marketplaceMatchById}
            marketplaceNeedOptions={marketplaceNeedOptions}
            marketplaceSearch={marketplaceSearch}
            marketplaceTrustReasons={marketplaceTrustReasons}
            matcherActions={matcherActions}
            matcherNeedId={matcherNeedId}
            matcherPrivateInfo={matcherPrivateInfo}
            onApplyMatcher={applyMarketplaceMatcher}
            onBackToHelpers={() => setShowMobileMarketplace(false)}
            onClearFilters={() => {
              setMarketplaceSearch("");
              setMarketplaceCategory("All");
              setMatcherPrivateInfo("unsure");
              setMatcherActions("unsure");
              setMarketplaceFilters({ usesPrivateInfo: false, canTakeActions: false, needsApproval: false });
            }}
            onConfirmInstall={setConfirmInstallAgent}
            onCreateCustomHelper={openAgentWizard}
            onEditInstalledAgentAccess={(agentId) => {
              setSelectedAgentId(agentId);
              setShowMobileMarketplace(false);
              scrollToSection("clearance");
            }}
            onMarketplaceRetry={() => {
              setMarketplaceError("");
              void refresh();
            }}
            onOpenDetails={openMarketplaceDetails}
            onOpenInstalledAgent={(agentId) => {
              setSelectedAgentId(agentId);
              setAgentProfileTab("chat");
              setShowMobileMarketplace(false);
              scrollToSection("agents");
            }}
            onRefresh={() => void refresh()}
            prioritizedMarketplaceAgents={prioritizedMarketplaceAgents}
            prioritizedMarketplaceMatches={prioritizedMarketplaceMatches}
            refreshError={refreshError}
            schemas={schemas}
            selectedMarketplaceAgent={selectedMarketplaceAgent}
            setMarketplaceCategory={setMarketplaceCategory}
            setMarketplaceFilters={setMarketplaceFilters}
            setMarketplaceSearch={setMarketplaceSearch}
            setMatcherActions={setMatcherActions}
            setMatcherNeedId={setMatcherNeedId}
            setMatcherPrivateInfo={setMatcherPrivateInfo}
            visibleMarketplaceCount={visibleMarketplaceAgents.length}
          />
          <div className={`panel agent-list mobile-section desktop-section ${activeMobileClass("agents")} ${sectionClass("agents")}`} id="agents">
            <div className="panel-heading-row">
              <div>
                <div className="panel-title">My AI Helpers</div>
                <p className="mobile-section-intro">Open a helper, review its access, or remove it from your profile.</p>
              </div>
              <StatusPill tone="blue">{agents.length} total</StatusPill>
            </div>
            <div className="helper-list-controls" aria-label="Find and filter my helpers">
              <label className="helper-search-label">
                <span>Search my helpers</span>
                <div className="search-input-wrap">
                  <Search size={16} />
                  <input
                    aria-label="Search my helpers"
                    onChange={(event) => setHelperSearch(event.currentTarget.value)}
                    placeholder="Search by name, task, or info..."
                    value={helperSearch}
                  />
                </div>
              </label>
              <div className="helper-status-filters" aria-label="Filter helpers by status">
                {helperStatusFilters.map((filter) => (
                  <button
                    className={helperStatusFilter === filter.id ? "selected" : ""}
                    key={filter.id}
                    onClick={() => setHelperStatusFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {hiddenTestHelperCount ? (
                <label className="helper-test-toggle">
                  <input
                    checked={hideTestHelpers}
                    onChange={(event) => setHideTestHelpers(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>Hide test helpers</span>
                  <small>{hiddenTestHelperCount} hidden</small>
                </label>
              ) : null}
            </div>
            <div className="mobile-panel-actions">
              <button className="primary-action" onClick={openMarketplace} type="button"><Bot size={16} /> Find a Helper</button>
              <button onClick={openAgentWizard} type="button"><Pencil size={16} /> Create custom</button>
            </div>
            <div className="mobile-helper-list" aria-label="My AI helpers for mobile">
              {mobileInstalledAgentCards.map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
                const cardActionLabel = pendingApprovals ? "Review approval" : permissions.missing ? "Review access" : "Use";
                const cardActionIcon = pendingApprovals || permissions.missing ? <KeyRound size={15} /> : <MessageSquare size={15} />;
                return (
                  <article className={agent.id === selectedAgent?.id ? "mobile-helper-card selected" : "mobile-helper-card"} key={`mobile-${agent.id}`}>
                    <button className="mobile-helper-main" onClick={() => {
                      setSelectedAgentId(agent.id);
                      setAgentProfileTab("chat");
                    }} type="button">
                      <span>{agent.name}</span>
                      <small>{friendlyCategoryName(agent.category)} helper</small>
                      <StatusPill tone={cardReadiness.tone}>{cardReadiness.label}</StatusPill>
                    </button>
                    <p>{agent.capabilityManifest.description}</p>
                    <div className="mobile-helper-foot">
                      <small>{permissions.allowed} of {permissions.requested} info categories allowed</small>
                      {pendingApprovals ? <small>{pendingApprovals} approval waiting</small> : null}
                      <button onClick={() => {
                        setSelectedAgentId(agent.id);
                        if (pendingApprovals || permissions.missing) {
                          scrollToSection("clearance");
                        } else {
                          setAgentProfileTab("chat");
                        }
                      }} type="button">{cardActionIcon} {cardActionLabel}</button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="installed-agent-list desktop-helper-list">
              {visibleInstalledAgentCards.slice(0, 12).map(({ agent, readiness: cardReadiness, permissions, pendingApprovals }) => {
                const cardActionLabel = pendingApprovals ? "Review approval" : permissions.missing ? "Review access" : "Open chat";
                const isPinned = pinnedAgentIds.includes(agent.id);
                return (
                  <article className={agent.id === selectedAgent?.id ? "installed-agent-card selected" : "installed-agent-card"} key={agent.id}>
                    <div className="agent-card-head">
                      <button className="agent-row" onClick={() => {
                        setSelectedAgentId(agent.id);
                        setAgentProfileTab("chat");
                      }} type="button">
                        <span>{agent.name}</span>
                        <small>{friendlyCategoryName(agent.category)} / {friendlyTrustLabel(agent.trustScore)}</small>
                      </button>
                      <button
                        aria-label={isPinned ? `Unpin ${agent.name}` : `Pin ${agent.name}`}
                        className={isPinned ? "pin-button selected" : "pin-button"}
                        onClick={() => togglePinnedAgent(agent.id)}
                        title={isPinned ? "Unpin helper" : "Pin helper"}
                        type="button"
                      >
                        <Pin size={14} />
                      </button>
                    </div>
                    <div className="installed-agent-status">
                      <StatusPill tone={cardReadiness.tone}>{cardReadiness.label}</StatusPill>
                      <small>{cardReadiness.detail}</small>
                      <small>{permissions.allowed} of {permissions.requested} info categories allowed</small>
                      {pendingApprovals ? <small>{pendingApprovals} approval waiting</small> : null}
                    </div>
                    <div className="installed-agent-actions">
                      <button onClick={() => {
                        setSelectedAgentId(agent.id);
                        if (pendingApprovals || permissions.missing) {
                          scrollToSection("clearance");
                        } else {
                          setAgentProfileTab("chat");
                          scrollToSection("agents");
                        }
                      }} type="button">{pendingApprovals || permissions.missing ? <KeyRound size={15} /> : <MessageSquare size={15} />} {cardActionLabel}</button>
                      <button onClick={() => {
                        setSelectedAgentId(agent.id);
                        scrollToSection("clearance");
                      }} type="button"><KeyRound size={15} /> Edit access</button>
                      <button className="danger" onClick={() => removeAgentFromProfile(agent)} type="button"><Trash2 size={15} /> Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>
            {agents.length > 0 && visibleInstalledAgentCards.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>No helpers match this view</strong>
                <p>Clear search, switch back to All, or show test helpers if you are checking old smoke data.</p>
                <button onClick={() => {
                  setHelperSearch("");
                  setHelperStatusFilter("all");
                  setHideTestHelpers(false);
                }} type="button">Show all helpers</button>
              </div>
            ) : null}
            {agents.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>No helpers yet</strong>
                <p>Start with one helper for a real task like travel, money, schedule, or personal notes.</p>
                <button onClick={openMarketplace} type="button"><Bot size={16} /> Find a helper</button>
              </div>
            ) : null}
            {visibleInstalledAgentCards.length > 12 ? <p className="empty">Showing 12 of {visibleInstalledAgentCards.length} matching helpers. Pin the ones you use most.</p> : null}
          </div>

          {selectedAgent ? (
            <AgentProfilePanel
              agentConversation={agentConversation}
              agentProfileTab={agentProfileTab}
              agentRunResult={agentRunResult}
              allowedPermissionCount={allowedPermissionCount}
              approvalPlainSentence={approvalPlainSentence}
              approvalReason={approvalReason}
              approvedContinuation={approvedContinuation}
              chatInput={chatInput}
              chatTranscript={chatTranscript}
              className={`panel detail-panel mobile-section desktop-section ${activeMobileClass("agents")} ${sectionClass("agents")}`}
              continueApprovedAction={continueApprovedAction}
              decideHitl={decideHitl}
              decidingApprovalId={decidingApprovalId}
              friendlyDate={friendlyDate}
              friendlyFallbackReason={friendlyFallbackReason}
              friendlyLogDetail={friendlyLogDetail}
              friendlyLogText={friendlyLogText}
              friendlyTrustLabel={friendlyTrustLabel}
              grantAllRequestedSchemas={grantAllRequestedSchemas}
              grantingSchemaName={grantingSchemaName}
              grantRequestedSchema={grantRequestedSchema}
              helperNextStep={helperNextStep}
              isAgentRunning={isAgentRunning}
              isConversationLoading={isConversationLoading}
              lastFailedPrompt={lastFailedPrompt}
              permissionReview={permissionReview}
              promptPreview={promptPreview}
              readiness={readiness}
              removeAgentFromProfile={removeAgentFromProfile}
              revokeSelectedAgentAccess={revokeSelectedAgentAccess}
              runAgentChat={runAgentChat}
              runSummary={runSummary}
              runVaultSearch={runVaultSearch}
              scrollToClearance={() => scrollToSection("clearance")}
              selectedAgent={selectedAgent}
              selectedAgentApprovals={selectedAgentApprovals}
              selectedAgentLogs={selectedAgentLogs}
              selectedCannotDoLabel={selectedCannotDoLabel}
              selectedHelperToolsLabel={selectedHelperToolsLabel}
              selectedReadableInfo={selectedReadableInfo}
              selectedReadableInfoLabel={selectedReadableInfoLabel}
              selectedRiskyActions={selectedRiskyActions}
              selectedRiskyActionsLabel={selectedRiskyActionsLabel}
              setAgentProfileTab={setAgentProfileTab}
              setChatInput={setChatInput}
              submitAgentPrompt={submitAgentPrompt}
              suggestedPrompts={suggestedPrompts}
              togglePermission={togglePermission}
              triggerHighRiskAction={triggerHighRiskAction}
              ungrantedRequestedSchemas={ungrantedRequestedSchemas}
            />
          ) : null}
          <div className={`panel clearance-panel mobile-section desktop-section ${activeMobileClass("clearance")} ${sectionClass("clearance")}`} id="clearance">
            <div className="panel-heading-row">
              <div>
                <div className="panel-title">Permissions</div>
                <p className="mobile-section-intro">Choose what {selectedAgent?.name ?? "this helper"} can read. You can change this anytime.</p>
              </div>
              <StatusPill tone={ungrantedRequestedSchemas.length ? "amber" : "green"}>
                {ungrantedRequestedSchemas.length ? `${ungrantedRequestedSchemas.length} needs review` : "all clear"}
              </StatusPill>
            </div>
            <div className="permission-center-summary">
              <div><strong>{selectedAgent?.name ?? "Selected helper"}</strong><span>Selected helper</span></div>
              <div><strong>{allowedPermissionCount}</strong><span>Allowed categories</span></div>
              <div><strong>{hitl.length}</strong><span>Approvals waiting</span></div>
            </div>
            {permissionCenterRows.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>No private info categories yet</strong>
                <p>Add your first private note and this page will show exactly which helpers can use it.</p>
                <button onClick={() => setIsAddingVaultItem(true)} type="button"><FilePlus size={16} /> Add Private Info</button>
              </div>
            ) : null}
            {permissionCenterRows.map(({ schema, allowedAgents, requestingAgents }) => {
              const granted = Boolean(selectedAgent?.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read"));
              const selectedRequestsThis = Boolean(selectedAgent?.capabilityManifest.requestedSchemas?.includes(schema.name));
              const allowedSummary = allowedAgents.length
                ? `${allowedAgents.length} helper${allowedAgents.length === 1 ? "" : "s"} can read this category.`
                : "No helper can read this category yet.";
              const requestSummary = requestingAgents.length
                ? `${requestingAgents.length} helper${requestingAgents.length === 1 ? "" : "s"} may ask for this category.`
                : "";
              return (
                <div className="clearance-row permission-category-row" key={schema.id}>
                  <label>
                    <input type="checkbox" checked={granted} onChange={(event) => void togglePermission(schema, event.currentTarget.checked)} />
                    <span>{granted ? "Allowed" : selectedRequestsThis ? "Requested" : "Not allowed"}</span>
                  </label>
                  <div>
                    <strong>{schema.name}</strong>
                    <small>{schema.description}</small>
                    <small>{selectedRequestsThis ? `${selectedAgent?.name ?? "This helper"} requested this.` : `${selectedAgent?.name ?? "This helper"} has not requested this.`}</small>
                    <small>{allowedSummary}</small>
                    {requestSummary ? <small>{requestSummary}</small> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`panel vault-panel mobile-section desktop-section ${activeMobileClass("vault")} ${sectionClass("vault")}`} id="vault">
            <div className="panel-title">Private Info</div>
            <div className="mobile-panel-actions">
              <button onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Private Info</button>
              <label className="upload-button">
                <Upload size={16} /> Upload
                <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void uploadVaultFile(event)} type="file" />
              </label>
              <button onClick={reindexVault} type="button"><FileSearch size={16} /> Refresh Info</button>
            </div>
            <form className="vault-search" onSubmit={(event) => void searchVault(event)}>
              <input
                aria-label="Search private info"
                name="private-info-search"
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search personal info through the selected helper..."
                required
                value={searchQuery}
              />
              <select aria-label="Filter private info category" onChange={(event) => setSearchSchemaId(event.currentTarget.value)} value={searchSchemaId}>
                <option value="">All allowed categories</option>
                {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
              </select>
              <button disabled={isSearchingVault} type="submit"><Search size={16} /> {isSearchingVault ? "Searching..." : "Search Info"}</button>
            </form>
            {searchResults.length ? (
              <div className="search-results">
                <strong>Search results</strong>
                {searchResults.map((document) => (
                  <article className="doc-row" key={`result-${document.id}`}>
                    <strong>{document.title}</strong>
                    <span>{document.vaultSchema?.name ?? "Uncategorized"}</span>
                    <p>{document.excerpt}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {documents.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>No private info yet</strong>
                <p>Save a note like travel preferences, payment rules, or household details. Helpers can only read it after you allow access.</p>
                <button onClick={() => setIsAddingVaultItem(true)} type="button"><FilePlus size={16} /> Save your first note</button>
              </div>
            ) : null}
            {visibleDocuments.map((document) => (
              <article className="doc-row" key={document.id}>
                <strong>{document.title}</strong>
                <span>{document.vaultSchema?.name ?? "Uncategorized"}</span>
                <p>{document.excerpt}</p>
                <div className="button-row compact-row">
                  <button onClick={() => beginEditVaultItem(document)} type="button"><Pencil size={15} /> Edit</button>
                  <button className="danger" onClick={() => deleteVaultItem(document)} type="button"><Trash2 size={15} /> Delete</button>
                </div>
              </article>
            ))}
            {documents.length > visibleDocuments.length ? <p className="empty">Showing {visibleDocuments.length} of {documents.length} notes. Use search to find older notes.</p> : null}
          </div>

          <div className={`panel audit-panel mobile-section desktop-section ${activeMobileClass("activity")} ${sectionClass("activity")}`} id="activity">
            <div className="panel-heading-row">
              <div>
                <div className="panel-title">Receipts</div>
                <p className="mobile-section-intro">Every helper access, approval, and block appears here.</p>
              </div>
              <StatusPill tone="blue">{logs.length} events</StatusPill>
            </div>
            {recentLogs.map((log) => (
              <div className="log-row" key={log.id}>
                <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>
                  {log.status === "success" ? "done" : log.status === "pending_human_approval" ? "needs approval" : "blocked"}
                </StatusPill>
                <span>{friendlyLogText(log)}</span>
                {friendlyNotificationText(log) ? <small>{friendlyNotificationText(log)}</small> : null}
                <small>{friendlyLogDetail(log)}</small>
                <small>{friendlyDate(log.createdAt)}</small>
              </div>
            ))}
            {recentLogs.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>Your safety log will appear here</strong>
                <p>When a helper reads private info, asks for approval, or gets blocked, you will see the receipt here.</p>
                <button onClick={() => scrollToSection("agents")} type="button"><MessageSquare size={16} /> Use a helper</button>
              </div>
            ) : null}
          </div>

          <div className={`panel hitl-panel mobile-section desktop-section ${activeMobileClass("clearance")} ${sectionClass("clearance")}`}>
            <div className="panel-title">Needs Your Approval</div>
            {hitl.length === 0 ? (
              <div className="friendly-empty-state">
                <strong>Nothing needs your approval right now</strong>
                <p>When a helper wants to spend money, share sensitive info, or continue a risky action, it will pause here first.</p>
                <button onClick={() => scrollToSection("agents")} type="button"><Bot size={16} /> Back to helpers</button>
              </div>
            ) : visibleApprovals.map((request) => (
              <div className="hitl-row" key={request.id}>
                <strong>{request.agent.name} wants to continue</strong>
                <span>{approvalPlainSentence(request.actionName)}</span>
                <small>{approvalReason(request.actionName)} You can approve it, or deny it and nothing continues.</small>
                <div className="button-row">
                  <button disabled={decidingApprovalId === request.id} onClick={() => void decideHitl(request.id, true)}>Approve</button>
                  <button className="danger" disabled={decidingApprovalId === request.id} onClick={() => void decideHitl(request.id, false)}>Deny</button>
                </div>
              </div>
            ))}
            {hitl.length > visibleApprovals.length ? <p className="empty">Showing {visibleApprovals.length} of {hitl.length} approvals. Finish these first to keep review simple.</p> : null}
            <p className="empty">{toolResult}</p>
          </div>

          <div className={`panel settings-panel mobile-section desktop-section ${activeMobileClass("settings")} ${sectionClass("settings")}`} id="settings">
            <div className="panel-title">Settings</div>
            <div className="settings-grid">
              <div><strong>Account</strong><span>{session?.user.email ?? "Local development user"}</span></div>
              <div><strong>Helpers</strong><span>{agents.length}</span></div>
              <div><strong>Private Info</strong><span>{documents.length}</span></div>
              <div><strong>Receipts</strong><span>{logs.length}</span></div>
            </div>
            <div className="privacy-actions">
              <button onClick={exportMyData} type="button"><Download size={16} /> Export my data</button>
              <button onClick={revokeAllAgentAccess} type="button"><KeyRound size={16} /> Revoke all helper access</button>
              {session ? <button onClick={() => void signOut()} type="button"><LogOut size={16} /> Sign out</button> : null}
            </div>
            <p className="empty">Your workspace data is scoped to your signed-in account. Helpers start restricted, and private info access can be revoked at any time.</p>
          </div>
        </section>
        {confirmation ? (
          <div className="confirm-backdrop" role="presentation">
            <section aria-describedby="confirm-dialog-copy" aria-labelledby="confirm-dialog-title" aria-modal="true" className="confirm-dialog" role="dialog">
              <div className="panel-title">Please Confirm</div>
              <h2 id="confirm-dialog-title">{confirmation.title}</h2>
              <p id="confirm-dialog-copy">{confirmation.message}</p>
              <div className="button-row">
                <button
                  className={confirmation.tone === "danger" ? "danger" : ""}
                  disabled={isConfirming}
                  onClick={() => void runConfirmation()}
                  type="button"
                >
                  {isConfirming ? "Working..." : confirmation.confirmLabel}
                </button>
                <button disabled={isConfirming} onClick={() => setConfirmation(null)} type="button">Cancel</button>
              </div>
            </section>
          </div>
        ) : null}
        {confirmInstallAgent ? (
          <div className="confirm-backdrop" role="presentation">
            <section aria-describedby="install-dialog-copy" aria-labelledby="install-dialog-title" aria-modal="true" className="confirm-dialog install-confirm-dialog" role="dialog">
              <div className="panel-title">Add Helper</div>
              <h2 id="install-dialog-title">Add {confirmInstallAgent.name}?</h2>
              <p id="install-dialog-copy">This helper will be added to your profile. It cannot read private info until you allow it.</p>
              <div className="install-review-grid">
                <div><strong>Best for</strong><span>{confirmInstallAgent.tagline || confirmInstallAgent.description}</span></div>
                <div><strong>Needs access to</strong><span>{confirmInstallAgent.versions[0]?.capabilityManifest.requestedSchemas?.join(", ") || "No private info"}</span></div>
                <div><strong>Always asks before</strong><span>{confirmInstallAgent.versions[0]?.capabilityManifest.highRiskActions?.map(friendlyActionName).join(", ") || "No risky actions listed"}</span></div>
              </div>
              <div className="button-row">
                <button disabled={installingAgentId === confirmInstallAgent.id} onClick={() => void confirmMarketplaceInstall()} type="button">
                  <Download size={16} /> {installingAgentId === confirmInstallAgent.id ? "Adding..." : "Add helper"}
                </button>
                <button disabled={installingAgentId === confirmInstallAgent.id} onClick={() => setConfirmInstallAgent(null)} type="button">Cancel</button>
              </div>
            </section>
          </div>
        ) : null}
        {marketplaceDetailAgent ? (
          <div className="confirm-backdrop marketplace-detail-backdrop" role="presentation">
            <section aria-describedby="marketplace-detail-copy" aria-labelledby="marketplace-detail-title" aria-modal="true" className="marketplace-detail-sheet" role="dialog">
              {(() => {
                const manifest = marketplaceDetailAgent.versions[0]?.capabilityManifest ?? {};
                const install = installedByDefinitionId.get(marketplaceDetailAgent.id);
                const installedAgent = install?.agent ?? undefined;
                const alreadyInstalled = Boolean(marketplaceDetailAgent.installed || install);
                const installedPermissions = permissionProgress(installedAgent, schemas);
                const pendingApprovals = installedAgent ? hitl.filter((request) => request.agent.id === installedAgent.id).length : 0;
                return (
                  <>
                    <div className="marketplace-sheet-head">
                      <div>
                        <div className="panel-title">Helper Details</div>
                        <h2 id="marketplace-detail-title">{marketplaceDetailAgent.name}</h2>
                        <p id="marketplace-detail-copy">{marketplaceDetailAgent.description}</p>
                      </div>
                      <button onClick={() => setMarketplaceDetailAgent(null)} type="button">Close</button>
                    </div>
                    <div className="trust-row">
                      <span>{friendlyCategoryName(marketplaceDetailAgent.category)} helper</span>
                      <span>{friendlyTrustLabel(marketplaceDetailAgent.trustScore)}</span>
                      <span>{marketplaceDetailAgent.creator?.verified ? "Verified creator" : "Community listing"}</span>
                    </div>
                    <div className="trust-reason-list">
                      <strong>Why you can trust this</strong>
                      {marketplaceTrustReasons(marketplaceDetailAgent).map((reason) => <span key={reason}>{reason}</span>)}
                    </div>
                    {alreadyInstalled ? (
                      <div className="installed-marketplace-summary">
                        <strong>Added to your profile</strong>
                        <span>{installedPermissions.allowed} of {installedPermissions.requested} info categories allowed</span>
                        <span>{pendingApprovals ? `${pendingApprovals} approval waiting` : "No approvals waiting"}</span>
                        <div>
                          {installedAgent ? (
                            <button onClick={() => {
                              setSelectedAgentId(installedAgent.id);
                              setAgentProfileTab("chat");
                              setMarketplaceDetailAgent(null);
                              setShowMobileMarketplace(false);
                              scrollToSection("agents");
                            }} type="button"><MessageSquare size={15} /> Open helper</button>
                          ) : null}
                          {installedAgent ? (
                            <button onClick={() => {
                              setSelectedAgentId(installedAgent.id);
                              setMarketplaceDetailAgent(null);
                              setShowMobileMarketplace(false);
                              scrollToSection("clearance");
                            }} type="button"><KeyRound size={15} /> Edit access</button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="manifest-grid marketplace-detail-grid">
                      <div><strong>Can help with</strong><span>{marketplaceDetailAgent.tagline || marketplaceDetailAgent.description}</span></div>
                      <div><strong>Can do</strong><span>{friendlyList(manifest.tools?.map(friendlyToolName) ?? [], "Simple tasks")}</span></div>
                      <div><strong>May ask to read</strong><span>{friendlyList(manifest.requestedSchemas ?? [], "No private info")}</span></div>
                      <div><strong>Will ask before</strong><span>{friendlyList(manifest.highRiskActions?.map(friendlyActionName) ?? [], "Nothing risky listed")}</span></div>
                    </div>
                    <div className="example-prompt-list">
                      <strong>Try after installing</strong>
                      {marketplaceExamplePrompts(marketplaceDetailAgent).map((prompt) => <span key={prompt}>{prompt}</span>)}
                    </div>
                    <div className="button-row">
                      <button
                        disabled={alreadyInstalled || installingAgentId === marketplaceDetailAgent.id}
                        onClick={() => {
                          setConfirmInstallAgent(marketplaceDetailAgent);
                          setMarketplaceDetailAgent(null);
                        }}
                        type="button"
                      >
                        <Download size={16} /> {alreadyInstalled ? "Added to profile" : installingAgentId === marketplaceDetailAgent.id ? "Adding..." : "Add helper"}
                      </button>
                      <button onClick={() => setMarketplaceDetailAgent(null)} type="button">Done</button>
                    </div>
                  </>
                );
              })()}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
