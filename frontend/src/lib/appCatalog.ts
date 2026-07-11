import type { AgentTemplate } from "../hooks/useAgentWizard";
import type { MarketplaceFilters, MarketplaceNeed } from "./marketplaceMatching";

export const categoryOptions = ["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"];

export const marketplaceCategoryOptions = ["All", "Travel", "Money", "Daily Tasks", "Applications", "Family", "Shopping", "Health", "Work"];

export const marketplaceNeedOptions: MarketplaceNeed[] = [
  { id: "travel", title: "Travel", detail: "Trips, bookings, loyalty", category: "Travel", query: "travel" },
  { id: "money", title: "Money", detail: "Budget, cards, payments", category: "Money", query: "money" },
  { id: "daily", title: "Daily Tasks", detail: "Reminders, planning, errands", category: "Daily Tasks", query: "task" },
  { id: "applications", title: "Applications", detail: "Jobs, school, forms, resumes", category: "Applications", query: "apply jobs resume school" },
  { id: "family", title: "Life Admin", detail: "Family, appointments, paperwork", category: "Family", query: "family admin appointment paperwork" },
  { id: "shopping", title: "Shopping", detail: "Compare options, subscriptions", category: "Shopping", query: "shopping" },
  { id: "health", title: "Health", detail: "Private health notes", category: "Health", query: "health" },
  { id: "work", title: "Work", detail: "Email, follow-ups, scheduling", category: "Work", query: "email" }
];

export const toolOptions = ["vault.search", "action.execute", "calendar.read", "email.draft", "web.fetch"];

export const marketplaceFilterLabels: Array<{ id: keyof MarketplaceFilters; label: string }> = [
  { id: "usesPrivateInfo", label: "Uses private info" },
  { id: "canTakeActions", label: "Can take actions" },
  { id: "needsApproval", label: "Must ask first" }
];

export const testHelperPattern = /(smoke|test|demo|sample)/i;

export const agentTemplates: AgentTemplate[] = [
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
    id: "applications",
    title: "Application helper",
    category: "Executive",
    starterName: "My Application Helper",
    description: "Helps organize resumes, applications, deadlines, and drafts while asking before anything is submitted.",
    tools: ["vault.search", "email.draft"],
    requestedSchemas: ["Personal Identity Profile"],
    highRiskActions: ["submit_application", "share_personal_info"],
    summary: "Good for jobs, school applications, forms, resumes, and deadline tracking."
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
