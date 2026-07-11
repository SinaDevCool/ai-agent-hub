import {
  Activity,
  Bot,
  ClipboardCheck,
  Database,
  KeyRound,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";

export type SectionId = "home" | "marketplace" | "helpers" | "creator" | "moderation" | "vault" | "clearance" | "activity" | "settings";

export type SectionHeading = {
  title: string;
  description: string;
};

export const navItems: Array<{ id: SectionId; label: string; mobileLabel: string; icon: LucideIcon; mobileVisible?: boolean }> = [
  { id: "home", label: "Home", mobileLabel: "Home", icon: ShieldCheck },
  { id: "marketplace", label: "Agent Pool", mobileLabel: "Pool", icon: Search },
  { id: "helpers", label: "My Agents", mobileLabel: "Agents", icon: Bot },
  { id: "moderation", label: "Review Queue", mobileLabel: "Review", icon: ClipboardCheck },
  { id: "vault", label: "Private Info", mobileLabel: "Info", icon: Database },
  { id: "clearance", label: "Access", mobileLabel: "Access", icon: KeyRound },
  { id: "activity", label: "Activity", mobileLabel: "Activity", icon: Activity },
  { id: "creator", label: "Creator Studio", mobileLabel: "Create", icon: Pencil },
  { id: "settings", label: "Settings", mobileLabel: "Settings", icon: Settings, mobileVisible: false }
];

export const consumerNavIds = new Set<SectionId>(["home", "marketplace", "helpers", "vault", "activity", "settings"]);

export const sectionHeadings: Record<SectionId, SectionHeading> = {
  home: {
    title: "What do you want help with today?",
    description: "Find an agent, ask for help, and stay in control of what it can read or do."
  },
  marketplace: {
    title: "Agent Pool",
    description: "Search agents built here or imported from trusted external platforms."
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
  vault: {
    title: "Private Info",
    description: "Keep important notes in one place so approved agents can use them safely."
  },
  clearance: {
    title: "Access",
    description: "Choose exactly which private info each agent can use."
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
