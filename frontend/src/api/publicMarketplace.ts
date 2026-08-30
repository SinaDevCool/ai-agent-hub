import { apiGet } from "./client";

export type PublicMarketplaceAgent = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  trustScore: number;
  installCount: number;
  averageRating: number;
  creator: { displayName: string; verified: boolean } | null;
  capabilities: {
    examplePrompts: string[];
    trustReasons: string[];
    requestedDataCategories: string[];
    actionSummary: string[];
    approvalRequired: boolean;
    runtimeSupport: Array<"web" | "desktop">;
    canTakeActions: boolean;
    availability: "available" | "beta" | "sandbox" | "configuration_required";
  };
};

export function listPublicMarketplaceAgents(params?: { search?: string; category?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.category && params.category !== "All") query.set("category", params.category);
  return apiGet<{ agents: PublicMarketplaceAgent[] }>(`/api/public/marketplace/agents${query.size ? `?${query}` : ""}`);
}

export function getPublicMarketplaceAgent(slug: string) {
  return apiGet<{ agent: PublicMarketplaceAgent }>(`/api/public/marketplace/agents/${encodeURIComponent(slug)}`);
}
