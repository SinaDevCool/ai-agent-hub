export function friendlyToolName(tool: string) {
  const labels: Record<string, string> = {
    "action.execute": "Take actions",
    "calendar.read": "Read calendar",
    "email.draft": "Draft email",
    "vault.search": "Read personal info",
    "web.fetch": "Browse the web"
  };
  return labels[tool] ?? tool;
}

export function friendlyCategoryName(category: string) {
  const labels: Record<string, string> = {
    Domestic: "Home",
    Executive: "Productivity",
    Financial: "Money",
    Wellness: "Health"
  };
  return labels[category] ?? category;
}

export function friendlyActionName(action: string) {
  const labels: Record<string, string> = {
    book_non_refundable_travel: "book non-refundable travel",
    buy_item: "buy something",
    open_credit_card: "open a credit card",
    send_email: "send an email",
    share_medical_record: "share a medical record",
    share_payment_info: "share payment info",
    share_personal_info: "share personal info",
    submit_application: "submit an application",
    transfer_funds: "transfer money"
  };
  const normalizedAction = action.trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  const label = labels[action] ?? labels[normalizedAction] ?? action.replace(/_/g, " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function friendlyList(items: Array<string | undefined>, fallback: string) {
  const cleanItems = items.filter(Boolean) as string[];
  if (cleanItems.length === 0) return fallback;
  if (cleanItems.length <= 2) return cleanItems.join(", ");
  return `${cleanItems.slice(0, 2).join(", ")} +${cleanItems.length - 2} more`;
}
