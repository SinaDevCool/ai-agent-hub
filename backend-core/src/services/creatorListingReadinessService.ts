import type { CapabilityManifest } from "./creatorManifestSchema.js";

const placeholderPattern = /\b(test|demo|sample|smoke|asdf|lorem|placeholder)\b/i;
const vagueListingPattern = /\b(does everything|general help|helps with tasks|ai agent|assistant for anything|all tasks)\b/i;
const trustLanguagePattern = /\b(permission|approval|approve|asks?|before|private|access|control|review|limited|restricted|pauses?|confirm)\b/i;
const approvalLanguagePattern = /\b(approval|approve|asks?|before|pauses?|confirm|permission|review)\b/i;

export type MarketplaceReadinessDecision =
  | { outcome: "publish"; message: string; code: string; items: MarketplaceReadinessItem[] }
  | { outcome: "needs_review"; message: string; code: string; items: MarketplaceReadinessItem[] }
  | { outcome: "block"; message: string; code: string; items: MarketplaceReadinessItem[] };

export type MarketplaceReadinessItem = {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  severity: "required" | "review" | "info";
  guidance: string;
};

function item(input: Omit<MarketplaceReadinessItem, "severity"> & { severity?: MarketplaceReadinessItem["severity"] }) {
  return {
    ...input,
    severity: input.required ? "required" as const : input.severity ?? "review" as const
  };
}

function summarizeItems(items: MarketplaceReadinessItem[]) {
  const requiredMissing = items.filter((check) => check.required && !check.passed);
  const reviewMissing = items.filter((check) => !check.required && !check.passed);
  return { requiredMissing, reviewMissing };
}

export function getMarketplaceReadinessItems(input: {
  name: string;
  tagline: string;
  description: string;
  category?: string;
  capabilityManifest: CapabilityManifest;
  hasVersion?: boolean;
}): MarketplaceReadinessItem[] {
  const normalizedName = normalized(input.name);
  const normalizedTagline = normalized(input.tagline);
  const trustText = input.capabilityManifest.trustReasons.join(" ");
  const approvalText = `${input.description} ${input.tagline} ${trustText}`;
  const isExternal = input.capabilityManifest.sourceType !== "native";

  return [
    item({
      key: "name",
      label: "Clear helper name",
      passed: input.name.trim().length >= 2 && !placeholderPattern.test(input.name),
      required: true,
      guidance: "Use a real helper name a normal person would understand."
    }),
    item({
      key: "tagline",
      label: "Plain benefit line",
      passed: input.tagline.trim().length >= 12
        && normalizedTagline !== normalizedName
        && !normalizedTagline.includes(normalizedName)
        && !placeholderPattern.test(input.tagline),
      required: false,
      guidance: "Write one sentence about the real-life task this helper handles."
    }),
    item({
      key: "description",
      label: "Useful description",
      passed: input.description.trim().length >= 40 && !vagueListingPattern.test(input.description),
      required: false,
      guidance: "Explain who this helps, what it does, and when it asks permission."
    }),
    item({
      key: "category",
      label: "Category selected",
      passed: input.category === undefined || Boolean(input.category),
      required: true,
      guidance: "Choose the closest marketplace category."
    }),
    item({
      key: "version",
      label: "Installable version",
      passed: input.hasVersion ?? true,
      required: true,
      guidance: "Save a version before submitting."
    }),
    item({
      key: "source",
      label: "Source declared",
      passed: !isExternal || Boolean(input.capabilityManifest.externalEndpointUrl),
      required: true,
      guidance: "External helpers need an endpoint or specification URL."
    }),
    item({
      key: "runtime",
      label: "Runtime type",
      passed: input.capabilityManifest.sourceType === "native"
        || input.capabilityManifest.sourceType === "mcp_server"
        || input.capabilityManifest.sourceType === "openapi_endpoint",
      required: true,
      guidance: "Choose whether this is built here, an MCP server, or an OpenAPI endpoint."
    }),
    item({
      key: "example_prompts",
      label: "First prompt",
      passed: input.capabilityManifest.examplePrompts.some((prompt) => prompt.trim().length >= 8),
      required: true,
      guidance: "Add at least one example a buyer could try immediately."
    }),
    item({
      key: "trust",
      label: "Trust and access note",
      passed: input.capabilityManifest.trustReasons.some((reason) => trustLanguagePattern.test(reason)),
      required: false,
      guidance: "Say what private info it may ask for and how the user stays in control."
    }),
    item({
      key: "risky_actions",
      label: "Approval for risky actions",
      passed: !input.capabilityManifest.highRiskActions.length || approvalLanguagePattern.test(approvalText),
      required: true,
      guidance: "If it can buy, book, send, or share, say clearly that it asks before continuing."
    }),
    item({
      key: "external_review",
      label: "External review",
      passed: !isExternal,
      required: false,
      severity: "info",
      guidance: "External helpers go to review so the endpoint and declared abilities can be verified."
    })
  ];
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

export function evaluateMarketplaceReadiness(input: {
  name: string;
  tagline: string;
  description: string;
  capabilityManifest: CapabilityManifest;
}): MarketplaceReadinessDecision {
  const items = getMarketplaceReadinessItems({ ...input, hasVersion: true });
  const { requiredMissing, reviewMissing } = summarizeItems(items);

  if (requiredMissing.length) {
    const first = requiredMissing[0];
    return {
      outcome: "block",
      message: first.guidance,
      code: first.key === "risky_actions"
        ? "creator_listing_risky_actions_need_approval_copy"
        : first.key === "name"
          ? "creator_listing_test_content"
          : "creator_listing_missing_required_details",
      items
    };
  }

  const reviewReason = reviewMissing.find((check) => check.key !== "external_review") ?? reviewMissing[0];
  if (reviewReason) {
    const isExternalReview = reviewReason.key === "external_review";
    return {
      outcome: "needs_review",
      message: isExternalReview
        ? "External helpers need marketplace review before they can be discovered because their endpoint and declared capabilities must be verified."
        : `This listing needs review: ${reviewReason.guidance}`,
      code: isExternalReview
        ? "creator_external_agent_needs_review"
        : reviewReason.key === "trust"
          ? "creator_listing_trust_missing"
          : "creator_listing_too_vague",
      items
    };
  }

  return {
    outcome: "publish",
    message: "This helper is ready for marketplace discovery.",
    code: "creator_listing_ready",
    items
  };
}
