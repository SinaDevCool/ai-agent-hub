import type { CreatorAgent, CreatorAgentDraftInput } from "../../api/types";
import { friendlyActionName } from "../../lib/display";

export type CreatorFormState = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  apiProtocol: "MCP" | "OpenAPI";
  sourceType: "native" | "mcp_server" | "openapi_endpoint";
  externalEndpointUrl: string;
  examplePromptsText: string;
  trustReasonsText: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActionsText: string;
  releaseNotes: string;
};

export const defaultCreatorForm: CreatorFormState = {
  name: "",
  tagline: "",
  description: "",
  category: "Travel",
  apiProtocol: "MCP",
  sourceType: "native",
  externalEndpointUrl: "",
  examplePromptsText: "",
  trustReasonsText: "Clear permission requests before private info is used.",
  tools: ["vault.search"],
  requestedSchemas: [],
  highRiskActionsText: "Buying, booking, sending, or sharing anything important",
  releaseNotes: ""
};

export function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formFromAgent(agent: CreatorAgent): CreatorFormState {
  const version = agent.versions[0];
  const manifest = version?.capabilityManifest ?? {};
  return {
    name: agent.name,
    tagline: agent.tagline,
    description: agent.description,
    category: agent.category,
    apiProtocol: version?.apiProtocol === "OpenAPI" ? "OpenAPI" : "MCP",
    sourceType: manifest.sourceType ?? "native",
    externalEndpointUrl: manifest.externalEndpointUrl ?? "",
    examplePromptsText: (manifest.examplePrompts ?? []).join("\n"),
    trustReasonsText: (manifest.trustReasons ?? []).join("\n"),
    tools: manifest.tools ?? [],
    requestedSchemas: manifest.requestedSchemas ?? [],
    highRiskActionsText: (manifest.highRiskActions ?? []).map(friendlyActionName).join("\n"),
    releaseNotes: ""
  };
}

export function draftFromForm(form: CreatorFormState): CreatorAgentDraftInput {
  const examplePrompts = splitLines(form.examplePromptsText);
  const trustReasons = splitLines(form.trustReasonsText);
  const highRiskActions = splitLines(form.highRiskActionsText);
  return {
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    description: form.description.trim(),
    category: form.category,
    apiProtocol: form.apiProtocol,
    capabilityManifest: {
      protocol: form.apiProtocol,
      sourceType: form.sourceType,
      externalEndpointUrl: form.sourceType === "native" ? undefined : form.externalEndpointUrl.trim(),
      verificationStatus: form.sourceType === "native" ? undefined : "declared",
      verificationSummary: form.sourceType === "native" ? [] : ["Creator declared this external endpoint; moderator verification is required."],
      tools: form.tools,
      requestedSchemas: form.requestedSchemas,
      highRiskActions,
      description: form.description.trim(),
      examplePrompts,
      trustReasons
    },
    releaseNotes: form.releaseNotes.trim()
  };
}

const placeholderPattern = /\b(test|demo|sample|smoke|asdf|lorem|placeholder)\b/i;
const vagueListingPattern = /\b(does everything|general help|helps with tasks|ai agent|assistant for anything|all tasks)\b/i;
const trustLanguagePattern = /\b(permission|approval|approve|asks?|before|private|access|control|review|limited|restricted|pauses?|confirm)\b/i;
const approvalLanguagePattern = /\b(approval|approve|asks?|before|pauses?|confirm|permission|review)\b/i;

export function sourceLabel(sourceType: CreatorFormState["sourceType"] | undefined) {
  if (sourceType === "mcp_server") return "External MCP server";
  if (sourceType === "openapi_endpoint") return "External OpenAPI endpoint";
  return "Built in AI Agent Hub";
}

export function readinessFor(form: CreatorFormState) {
  const highRiskActions = splitLines(form.highRiskActionsText);
  const trustReasons = splitLines(form.trustReasonsText);
  const approvalCopy = `${form.description} ${form.tagline} ${trustReasons.join(" ")}`;
  const name = form.name.trim().toLowerCase();
  const tagline = form.tagline.trim().toLowerCase();
  const isExternal = form.sourceType !== "native";
  const checks = [
    {
      label: "Clear name",
      passed: form.name.trim().length >= 2 && !placeholderPattern.test(form.name),
      required: true,
      guidance: "Use a real agent name people can understand."
    },
    {
      label: "Short benefit line",
      passed: form.tagline.trim().length >= 8 && !placeholderPattern.test(form.tagline),
      required: true,
      guidance: "Write one sentence about the job this agent does."
    },
    {
      label: "Useful description",
      passed: form.description.trim().length >= 20,
      required: true,
      guidance: "Explain who this helps and when it asks permission."
    },
    {
      label: "Source declared",
      passed: !isExternal || form.externalEndpointUrl.trim().length >= 8,
      required: true,
      guidance: "Imported agents need an endpoint or spec URL."
    },
    {
      label: "Example prompt",
      passed: splitLines(form.examplePromptsText).some((item) => item.length >= 8),
      required: true,
      guidance: "Add one prompt a normal person can try right away."
    },
    {
      label: "Trust note",
      passed: trustReasons.some((item) => item.length >= 8),
      required: true,
      guidance: "Add a plain note about access, limits, or approvals."
    },
    {
      label: "Clear user benefit",
      passed: form.description.trim().length >= 40
        && !vagueListingPattern.test(form.description)
        && tagline.length >= 12
        && tagline !== name
        && !tagline.includes(name),
      required: false,
      guidance: "Make the marketplace benefit less generic."
    },
    {
      label: "Trust explains control",
      passed: trustReasons.some((reason) => trustLanguagePattern.test(reason)),
      required: false,
      guidance: "Say how users control private info or approvals."
    },
    {
      label: "Approval for risky actions",
      passed: !highRiskActions.length || approvalLanguagePattern.test(approvalCopy),
      required: true,
      guidance: "Say it asks before buying, booking, sending, or sharing."
    },
    {
      label: "External review",
      passed: !isExternal,
      required: false,
      guidance: "Imported agents go to review before discovery."
    }
  ];
  const missingRequired = checks.filter((check) => check.required && !check.passed);
  const reviewItems = checks.filter((check) => !check.required && !check.passed);
  return {
    checks,
    missingRequired,
    reviewItems,
    score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100),
    ready: checks.every((check) => check.passed),
    canSubmit: checks.every((check) => check.passed || !check.required)
  };
}

export function previewList(value: string, fallback: string) {
  const items = splitLines(value);
  return items.length ? items.slice(0, 3) : [fallback];
}
