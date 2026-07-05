export type GatekeeperDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string; status: "blocked_by_policy" | "pending_human_approval" };

export type VaultParseResult = {
  title: string;
  relativePath: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  body: string;
  excerpt: string;
  schemaName?: string;
};

export type RealtimeEvent =
  | { type: "vault.indexed"; payload: unknown }
  | { type: "hitl.requested"; payload: unknown }
  | { type: "activity.created"; payload: unknown };
