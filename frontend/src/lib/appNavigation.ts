import {
  Activity,
  Bot,
  ClipboardCheck,
  Database,
  KeyRound,
  MonitorCog,
  UsersRound,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";

export type SectionId = "home" | "marketplace" | "helpers" | "creator" | "moderation" | "operations" | "beta" | "vault" | "clearance" | "activity" | "settings";

export type SectionHeading = {
  title: string;
  description: string;
};

export const navItems: Array<{ id: SectionId; label: string; mobileLabel: string; icon: LucideIcon; mobileVisible?: boolean }> = [
  { id: "home", label: "Home", mobileLabel: "Home", icon: ShieldCheck, mobileVisible: false },
  { id: "marketplace", label: "Discover", mobileLabel: "Discover", icon: Search },
  { id: "helpers", label: "My Agents", mobileLabel: "Agents", icon: Bot },
  { id: "moderation", label: "Review Queue", mobileLabel: "Review", icon: ClipboardCheck },
  { id: "operations", label: "Operations", mobileLabel: "Ops", icon: MonitorCog },
  { id: "beta", label: "Private Beta", mobileLabel: "Beta", icon: UsersRound },
  { id: "clearance", label: "Approvals", mobileLabel: "Approvals", icon: KeyRound },
  { id: "activity", label: "Activity", mobileLabel: "Activity", icon: Activity },
  { id: "vault", label: "Private Data", mobileLabel: "Data", icon: Database },
  { id: "creator", label: "Creator Studio", mobileLabel: "Create", icon: Pencil },
  { id: "settings", label: "Settings", mobileLabel: "Settings", icon: Settings, mobileVisible: false }
];

export const consumerNavIds = new Set<SectionId>(["home", "marketplace", "helpers", "clearance", "activity", "vault", "settings"]);

export const sectionHeadings: Record<SectionId, SectionHeading> = {
  home: {
    title: "What do you want help with today?",
    description: "Find an agent, ask for help, and stay in control of what it can read or do."
  },
  marketplace: {
    title: "Discover",
    description: "Find trusted agents for everyday life and see what each one can access before you add it."
  },
  helpers: {
    title: "My Agents",
    description: "Use your installed agents, review access, and remove agents you no longer use."
  },
  creator: {
    title: "Creator Studio",
    description: "Create, review, and publish agents for other people to discover."
  },
  moderation: {
    title: "Review Queue",
    description: "Approve agents that need a closer platform review before marketplace discovery."
  },
  operations: {
    title: "Operations",
    description: "Review release readiness, queue health, and recover durable background work."
  },
  beta: {
    title: "Private Beta",
    description: "Manage invite cohorts, onboarding outcomes, support feedback, and rollout signals."
  },
  vault: {
    title: "Private Data",
    description: "Keep important information in one place and choose which agents may use it."
  },
  clearance: {
    title: "Approvals",
    description: "Review what agents want to access or do before anything sensitive continues."
  },
  activity: {
    title: "Activity",
    description: "See receipts for what agents read, asked for, and could not do."
  },
  settings: {
    title: "Settings",
    description: "Manage your account, saved info access, and data export."
  }
};
