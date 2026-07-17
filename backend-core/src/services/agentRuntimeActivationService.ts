import type { Agent } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { badRequest, notFound } from "../errors/httpError.js";
import type { AgentCapabilityManifest } from "./agentRuntimeTypes.js";
import type {
  AgentImportManifest,
  AgentImportRuntimeKind,
  AgentRuntimeActivationStatus
} from "../types/agentImportManifest.js";
import { mapAgentCapabilities } from "./agentCapabilityMappingService.js";
import { validateExternalRuntimeUrl } from "./externalRuntimeProxyService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { createProviderDefinition, updateProviderDefinition } from "./providerDefinitionService.js";
import type { ConnectorAction } from "./connectorCapabilityService.js";
import { getConnectorCapability } from "./connectorCapabilityService.js";
import { defaultProviderActionSchema } from "./providers/providerManifestService.js";
import type { ProviderActionSchema, ProviderRiskLevel, ProviderRuntimeConfig } from "./providers/providerAdapterTypes.js";

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

export function setRuntimeActivationFetchForTest(nextFetch: FetchLike) {
  fetchImpl = nextFetch;
}

export function resetRuntimeActivationFetchForTest() {
  fetchImpl = fetch;
}

export type RuntimeActivationResult = {
  status: AgentRuntimeActivationStatus;
  executable: boolean;
  runtimeKind: AgentImportRuntimeKind;
  providerId?: string;
  providerDefinitionId?: string;
  workflowId?: string;
  endpointUrl?: string;
  discoveredTools: string[];
  discoveredCapabilities: string[];
  setupSteps: string[];
  blockers: string[];
  userMessage: string;
};

type OpenApiOperation = {
  operationId?: string;
  path?: string;
  method?: string;
  summary?: string;
  description?: string;
};

type DiscoveredTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getNormalizedImportManifest(manifest: AgentCapabilityManifest): AgentImportManifest | null {
  const normalized = manifest.normalizedImportManifest;
  if (!isRecord(normalized) || !isRecord(normalized.runtime) || typeof normalized.runtime.kind !== "string") return null;
  return normalized as AgentImportManifest;
}

function runtimeBinding(manifest: AgentImportManifest) {
  return manifest.runtimeBinding ?? {
    status: manifest.safety.reviewStatus === "blocked" ? "blocked" as const : "setup_required" as const,
    runtimeKind: manifest.runtime.kind,
    executable: false,
    providerId: manifest.runtime.providerId,
    workflowId: manifest.runtime.workflowId,
    endpointUrl: manifest.runtime.endpointUrl ?? manifest.source.endpointUrl,
    blockers: [],
    setupSteps: [],
    notes: []
  };
}

function cleanProviderId(value: string | undefined, fallback: string) {
  const id = (value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return id || fallback;
}

function activationResult(input: Omit<RuntimeActivationResult, "discoveredTools" | "discoveredCapabilities" | "setupSteps" | "blockers"> & {
  discoveredTools?: string[];
  discoveredCapabilities?: string[];
  setupSteps?: string[];
  blockers?: string[];
}): RuntimeActivationResult {
  return {
    ...input,
    discoveredTools: unique(input.discoveredTools ?? []),
    discoveredCapabilities: unique(input.discoveredCapabilities ?? []),
    setupSteps: unique(input.setupSteps ?? []),
    blockers: unique(input.blockers ?? [])
  };
}

async function requireInstalledAgent(input: { userId: string; agentId: string }) {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, connections: { some: { userId: input.userId } } }
  });
  if (!agent) throw notFound("Agent not found.", "agent_not_found");
  return agent;
}

function decodeCapabilityManifest(agent: Pick<Agent, "capabilityManifest">) {
  return decodeJson<AgentCapabilityManifest>(agent.capabilityManifest, {});
}

function actionForCapability(capabilityKey: string): ConnectorAction {
  return getConnectorCapability(capabilityKey)?.defaultAction ?? "search";
}

function actionForRuntimeText(value: string, fallback: ConnectorAction): ConnectorAction {
  return /\b(book|booking|reserve|checkout|purchase|pay|non[-_\s]?refundable)\b/i.test(value)
    ? "reserve"
    : fallback;
}

function riskForCapabilities(capabilities: string[]): ProviderRiskLevel {
  return capabilities.some((capability) => capability === "travel.hold_or_book") ? "high" : "medium";
}

function buildActionSchemas(capabilities: string[], actions: ConnectorAction[]): ProviderActionSchema[] {
  return capabilities.flatMap((capabilityKey) =>
    actions.map((action) => defaultProviderActionSchema({
      capabilityKey,
      action,
      riskLevel: action === "reserve" || action === "execute_action" ? "high" : riskForCapabilities([capabilityKey])
    }))
  );
}

async function upsertRuntimeProviderDefinition(input: {
  userId: string;
  providerId: string;
  label: string;
  kind: "mcp" | "openapi" | "api";
  endpointUrl: string;
  capabilities: string[];
  actions: ConnectorAction[];
  runtimeConfig?: Partial<ProviderRuntimeConfig>;
}) {
  const existing = await prisma.providerDefinition.findUnique({ where: { providerId: input.providerId } });
  const payload = {
    providerId: input.providerId,
    label: input.label,
    kind: input.kind,
    toolName: `${input.providerId}.run`,
    description: `Imported ${input.kind.toUpperCase()} runtime for ${input.label}.`,
    capabilities: input.capabilities,
    actions: input.actions,
    actionSchemas: buildActionSchemas(input.capabilities, input.actions),
    runtimeConfig: { endpointUrl: input.endpointUrl, method: "POST" as const, ...input.runtimeConfig },
    credentialType: "none" as const,
    credentialFields: [],
    authType: "none" as const,
    riskLevel: riskForCapabilities(input.capabilities),
    requiresConnectedAccount: false,
    supportsHealthCheck: true,
    status: "active" as const
  };
  return existing
    ? updateProviderDefinition(existing.id, payload)
    : createProviderDefinition(input.userId, payload);
}

function parseMcpTools(body: unknown): DiscoveredTool[] {
  if (!isRecord(body)) return [];
  const result = body.result;
  const tools = isRecord(result) ? result.tools : body.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter(isRecord)
    .map((tool) => ({
      name: String(tool.name ?? "").trim(),
      description: typeof tool.description === "string" ? tool.description : undefined,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema
    }))
    .filter((tool) => tool.name)
    .slice(0, 40);
}

async function discoverMcpTools(endpointUrl: string) {
  const response = await fetchImpl(endpointUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "runtime-activation", method: "tools/list", params: {} })
  });
  if (!response.ok) throw badRequest("This agent's MCP tool server is not responding correctly.", "mcp_activation_failed");
  return parseMcpTools(await response.json());
}

function parseOpenApiOperations(spec: unknown): OpenApiOperation[] {
  if (!isRecord(spec) || !isRecord(spec.paths)) return [];
  const operations: OpenApiOperation[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isRecord(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method.toLowerCase()) || !isRecord(operation)) continue;
      operations.push({
        path,
        method: method.toUpperCase(),
        operationId: typeof operation.operationId === "string" ? operation.operationId : undefined,
        summary: typeof operation.summary === "string" ? operation.summary : undefined,
        description: typeof operation.description === "string" ? operation.description : undefined
      });
    }
  }
  return operations.slice(0, 80);
}

async function fetchOpenApiOperations(endpointUrl: string) {
  const response = await fetchImpl(endpointUrl, { method: "GET", headers: { accept: "application/json" } });
  if (!response.ok) throw badRequest("This agent's action list could not be read.", "openapi_activation_failed");
  const operations = parseOpenApiOperations(await response.json());
  if (!operations.length) throw badRequest("This OpenAPI file does not expose usable actions yet.", "openapi_no_operations");
  return operations;
}

function mergeActivationIntoManifest(input: {
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
  result: RuntimeActivationResult;
}) {
  const now = new Date().toISOString();
  const binding = runtimeBinding(input.normalized);
  const nextNormalized: AgentImportManifest = {
    ...input.normalized,
    capabilities: input.result.discoveredCapabilities.length
      ? input.result.discoveredCapabilities.map((capabilityKey) => ({
          canonicalCapability: capabilityKey,
          label: getConnectorCapability(capabilityKey)?.label ?? capabilityKey,
          confidence: 0.9,
          sourceReason: "Discovered during runtime activation."
        }))
      : input.normalized.capabilities,
    runtime: {
      ...input.normalized.runtime,
      providerId: input.result.providerId ?? input.normalized.runtime.providerId,
      workflowId: input.result.workflowId ?? input.normalized.runtime.workflowId,
      endpointUrl: input.result.endpointUrl ?? input.normalized.runtime.endpointUrl
    },
    runtimeBinding: {
      ...binding,
      status: input.result.status === "active" ? "bound" : input.result.status === "blocked" ? "blocked" : "setup_required",
      activationStatus: input.result.status,
      executable: input.result.executable,
      providerId: input.result.providerId ?? binding.providerId,
      providerDefinitionId: input.result.providerDefinitionId ?? binding.providerDefinitionId,
      workflowId: input.result.workflowId ?? binding.workflowId,
      endpointUrl: input.result.endpointUrl ?? binding.endpointUrl,
      activatedAt: input.result.status === "active" ? now : binding.activatedAt,
      lastCheckedAt: now,
      discoveredCapabilities: input.result.discoveredCapabilities,
      discoveredTools: input.result.discoveredTools,
      blockers: input.result.blockers,
      setupSteps: input.result.setupSteps,
      notes: unique([...binding.notes, input.result.userMessage])
    }
  };
  return {
    ...input.capabilityManifest,
    tools: unique([
      ...(input.capabilityManifest.tools ?? []),
      ...(input.result.status === "active" && ["workflow", "mcp", "openapi", "api"].includes(input.result.runtimeKind) ? ["workflow.run"] : [])
    ]),
    normalizedImportManifest: nextNormalized
  };
}

async function saveActivation(input: {
  userId: string;
  agent: Agent;
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
  result: RuntimeActivationResult;
}) {
  const updatedManifest = mergeActivationIntoManifest(input);
  await prisma.agent.update({
    where: { id: input.agent.id },
    data: { capabilityManifest: encodeJson(updatedManifest) }
  });
  return input.result;
}

async function activateWorkflow(input: {
  userId: string;
  agent: Agent;
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
  workflowId?: string;
}) {
  const binding = runtimeBinding(input.normalized);
  const workflow = await prisma.workflowConnection.findFirst({
    where: {
      userId: input.userId,
      id: input.workflowId ?? binding.workflowId ?? input.normalized.runtime.workflowId,
      status: "active"
    }
  });
  if (!workflow) {
    return saveActivation({
      ...input,
      result: activationResult({
        status: "setup_required",
        executable: false,
        runtimeKind: "workflow",
        workflowId: input.workflowId ?? binding.workflowId,
        setupSteps: ["Connect and test an active workflow for this agent."],
        userMessage: "Connect a workflow before this imported agent can run."
      })
    });
  }
  return saveActivation({
    ...input,
    result: activationResult({
      status: "active",
      executable: true,
      runtimeKind: "workflow",
      providerId: workflow.provider,
      workflowId: workflow.id,
      discoveredTools: [workflow.toolName],
      discoveredCapabilities: [workflow.capabilityKey],
      userMessage: "Workflow runtime is active."
    })
  });
}

async function activateMcp(input: {
  userId: string;
  agent: Agent;
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
}) {
  const binding = runtimeBinding(input.normalized);
  const endpointUrl = binding.endpointUrl ?? input.normalized.runtime.endpointUrl ?? input.normalized.source.endpointUrl;
  const urlDecision = validateExternalRuntimeUrl(endpointUrl);
  if (!urlDecision.allowed) {
    return saveActivation({
      ...input,
      result: activationResult({
        status: "blocked",
        executable: false,
        runtimeKind: "mcp",
        endpointUrl,
        blockers: [urlDecision.reason],
        userMessage: "This MCP endpoint is not safe to activate."
      })
    });
  }
  const tools = await discoverMcpTools(urlDecision.url.toString());
  const mapped = mapAgentCapabilities({
    name: input.agent.name,
    description: input.normalized.identity.description,
    category: input.normalized.identity.category,
    sourceType: "mcp",
    tools
  });
  const capabilities = unique(mapped.mappings.map((mapping) => mapping.canonicalCapability));
  const mcpTools = tools.map((tool) => {
    const toolMapped = mapAgentCapabilities({
      name: input.agent.name,
      description: input.normalized.identity.description,
      category: input.normalized.identity.category,
      sourceType: "mcp",
      tools: [tool]
    });
    const capabilityKey = toolMapped.mappings[0]?.canonicalCapability ?? capabilities[0] ?? "general.research";
    const action = actionForRuntimeText(`${tool.name} ${tool.description ?? ""}`, actionForCapability(capabilityKey));
    return { name: tool.name, description: tool.description, capabilityKey, action };
  });
  const actions = unique(mcpTools.map((tool) => tool.action)) as ConnectorAction[];
  const providerId = cleanProviderId(binding.providerId ?? input.normalized.runtime.providerId, `imported-mcp-${input.agent.id}`);
  const provider = await upsertRuntimeProviderDefinition({
    userId: input.userId,
    providerId,
    label: input.agent.name,
    kind: "mcp",
    endpointUrl: urlDecision.url.toString(),
    capabilities,
    actions,
    runtimeConfig: { mcpTools }
  });
  return saveActivation({
    ...input,
    result: activationResult({
      status: "active",
      executable: true,
      runtimeKind: "mcp",
      providerId,
      providerDefinitionId: provider.id,
      endpointUrl: urlDecision.url.toString(),
      discoveredTools: tools.map((tool) => tool.name),
      discoveredCapabilities: capabilities,
      userMessage: "MCP runtime is active."
    })
  });
}

async function activateOpenApi(input: {
  userId: string;
  agent: Agent;
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
}) {
  const binding = runtimeBinding(input.normalized);
  const endpointUrl = binding.endpointUrl ?? input.normalized.runtime.endpointUrl ?? input.normalized.source.endpointUrl;
  const urlDecision = validateExternalRuntimeUrl(endpointUrl);
  if (!urlDecision.allowed) {
    return saveActivation({
      ...input,
      result: activationResult({
        status: "blocked",
        executable: false,
        runtimeKind: "openapi",
        endpointUrl,
        blockers: [urlDecision.reason],
        userMessage: "This OpenAPI endpoint is not safe to activate."
      })
    });
  }
  const operations = await fetchOpenApiOperations(urlDecision.url.toString());
  const mapped = mapAgentCapabilities({
    name: input.agent.name,
    description: input.normalized.identity.description,
    category: input.normalized.identity.category,
    sourceType: "openapi",
    operations
  });
  const capabilities = unique(mapped.mappings.map((mapping) => mapping.canonicalCapability));
  const operationsForRuntime = operations.map((operation) => {
    const operationMapped = mapAgentCapabilities({
      name: input.agent.name,
      description: input.normalized.identity.description,
      category: input.normalized.identity.category,
      sourceType: "openapi",
      operations: [operation]
    });
    const capabilityKey = operationMapped.mappings[0]?.canonicalCapability ?? capabilities[0] ?? "general.research";
    const action = actionForRuntimeText(
      `${operation.operationId ?? ""} ${operation.method ?? ""} ${operation.path ?? ""} ${operation.summary ?? ""} ${operation.description ?? ""}`,
      actionForCapability(capabilityKey)
    );
    return {
      operationId: operation.operationId,
      path: operation.path,
      method: operation.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined,
      summary: operation.summary,
      description: operation.description,
      capabilityKey,
      action
    };
  });
  const actions = unique(operationsForRuntime.map((operation) => operation.action)) as ConnectorAction[];
  const providerId = cleanProviderId(binding.providerId ?? input.normalized.runtime.providerId, `imported-openapi-${input.agent.id}`);
  const provider = await upsertRuntimeProviderDefinition({
    userId: input.userId,
    providerId,
    label: input.agent.name,
    kind: "openapi",
    endpointUrl: urlDecision.url.toString(),
    capabilities,
    actions,
    runtimeConfig: { operations: operationsForRuntime }
  });
  return saveActivation({
    ...input,
    result: activationResult({
      status: "active",
      executable: true,
      runtimeKind: "openapi",
      providerId,
      providerDefinitionId: provider.id,
      endpointUrl: urlDecision.url.toString(),
      discoveredTools: operations.map((operation) => operation.operationId || `${operation.method} ${operation.path}`),
      discoveredCapabilities: capabilities,
      userMessage: "OpenAPI runtime is active."
    })
  });
}

async function activateApi(input: {
  userId: string;
  agent: Agent;
  capabilityManifest: AgentCapabilityManifest;
  normalized: AgentImportManifest;
}) {
  const binding = runtimeBinding(input.normalized);
  const endpointUrl = binding.endpointUrl ?? input.normalized.runtime.endpointUrl ?? input.normalized.source.endpointUrl;
  const urlDecision = validateExternalRuntimeUrl(endpointUrl);
  if (!urlDecision.allowed) {
    return saveActivation({
      ...input,
      result: activationResult({
        status: "blocked",
        executable: false,
        runtimeKind: "api",
        endpointUrl,
        blockers: [urlDecision.reason],
        setupSteps: ["Add a secure public HTTPS API endpoint before activating this hosted agent."],
        userMessage: "This hosted API agent needs a safe endpoint before it can run."
      })
    });
  }
  return saveActivation({
    ...input,
    result: activationResult({
      status: "setup_required",
      executable: false,
      runtimeKind: "api",
      endpointUrl: urlDecision.url.toString(),
      setupSteps: ["Add an action schema and authentication policy before activating hosted API execution."],
      userMessage: "Hosted API activation needs an explicit action schema before execution is enabled."
    })
  });
}

export async function getAgentRuntimeSetup(input: { userId: string; agentId: string }) {
  const agent = await requireInstalledAgent(input);
  const capabilityManifest = decodeCapabilityManifest(agent);
  const normalized = getNormalizedImportManifest(capabilityManifest);
  if (!normalized) {
    return activationResult({
      status: "active",
      executable: true,
      runtimeKind: "local",
      discoveredTools: capabilityManifest.tools ?? [],
      discoveredCapabilities: [],
      userMessage: "This local agent is ready."
    });
  }
  const binding = runtimeBinding(normalized);
  return activationResult({
    status: binding.activationStatus ?? (binding.status === "bound" && binding.executable ? "active" : binding.status === "blocked" ? "blocked" : "setup_required"),
    executable: binding.executable,
    runtimeKind: binding.runtimeKind,
    providerId: binding.providerId,
    providerDefinitionId: binding.providerDefinitionId,
    workflowId: binding.workflowId,
    endpointUrl: binding.endpointUrl,
    discoveredTools: binding.discoveredTools ?? [],
    discoveredCapabilities: binding.discoveredCapabilities ?? normalized.capabilities.map((capability) => capability.canonicalCapability),
    setupSteps: binding.setupSteps,
    blockers: binding.blockers,
    userMessage: binding.activationStatus === "active" ? "This imported agent is active." : "Set up this imported agent before it can run."
  });
}

export async function activateAgentRuntime(input: { userId: string; agentId: string; workflowId?: string }) {
  const agent = await requireInstalledAgent(input);
  const capabilityManifest = decodeCapabilityManifest(agent);
  const normalized = getNormalizedImportManifest(capabilityManifest);
  if (!normalized) {
    return activationResult({
      status: "active",
      executable: true,
      runtimeKind: "local",
      discoveredTools: capabilityManifest.tools ?? [],
      userMessage: "This local agent is already active."
    });
  }
  const binding = runtimeBinding(normalized);
  if (binding.status === "blocked" || normalized.safety.reviewStatus === "blocked") {
    return saveActivation({
      userId: input.userId,
      agent,
      capabilityManifest,
      normalized,
      result: activationResult({
        status: "blocked",
        executable: false,
        runtimeKind: binding.runtimeKind,
        endpointUrl: binding.endpointUrl,
        blockers: unique([...binding.blockers, ...normalized.safety.notes]),
        setupSteps: ["Fix the blocked import review before enabling this runtime."],
        userMessage: "This imported agent is blocked and cannot be activated."
      })
    });
  }
  if (binding.runtimeKind === "workflow") return activateWorkflow({ userId: input.userId, agent, capabilityManifest, normalized, workflowId: input.workflowId });
  if (binding.runtimeKind === "mcp") return activateMcp({ userId: input.userId, agent, capabilityManifest, normalized });
  if (binding.runtimeKind === "openapi") return activateOpenApi({ userId: input.userId, agent, capabilityManifest, normalized });
  if (binding.runtimeKind === "api") return activateApi({ userId: input.userId, agent, capabilityManifest, normalized });
  if (binding.runtimeKind === "manual") {
    return saveActivation({
      userId: input.userId,
      agent,
      capabilityManifest,
      normalized,
      result: activationResult({
        status: "setup_required",
        executable: false,
        runtimeKind: "manual",
        setupSteps: ["Manual agents can be listed, but they do not run backend tools."],
        userMessage: "Manual agents cannot be activated for execution."
      })
    });
  }
  throw badRequest("This imported runtime type is not supported for activation yet.", "runtime_activation_unsupported");
}

export async function testAgentRuntimeSetup(input: { userId: string; agentId: string }) {
  const setup = await getAgentRuntimeSetup(input);
  if (setup.status !== "active" || !setup.executable) {
    return {
      ok: false,
      runtime: setup,
      reason: setup.blockers[0] || setup.setupSteps[0] || "Set up this agent before it can run."
    };
  }
  return {
    ok: true,
    runtime: setup,
    message: "This agent runtime is active and ready for policy-gated execution."
  };
}

export function importedRuntimeNeedsActivation(manifest: AgentCapabilityManifest) {
  const normalized = getNormalizedImportManifest(manifest);
  if (!normalized) return null;
  const binding = runtimeBinding(normalized);
  const activationStatus = binding.activationStatus ?? (binding.status === "bound" && binding.executable ? "active" : binding.status === "blocked" ? "blocked" : "setup_required");
  if (activationStatus === "active" && binding.executable) return null;
  return {
    activationStatus,
    runtimeKind: binding.runtimeKind,
    blockers: binding.blockers,
    setupSteps: binding.setupSteps
  };
}

export function getActiveImportedRuntimeProvider(manifest: AgentCapabilityManifest) {
  const normalized = getNormalizedImportManifest(manifest);
  if (!normalized) return null;
  const binding = runtimeBinding(normalized);
  const activationStatus = binding.activationStatus ?? (binding.status === "bound" && binding.executable ? "active" : binding.status === "blocked" ? "blocked" : "setup_required");
  if (activationStatus !== "active" || !binding.executable || !binding.providerId) return null;
  if (!["workflow", "mcp", "openapi", "api"].includes(binding.runtimeKind)) return null;
  return {
    providerId: binding.providerId,
    runtimeKind: binding.runtimeKind,
    capabilities: binding.discoveredCapabilities?.length
      ? binding.discoveredCapabilities
      : normalized.capabilities.map((capability) => capability.canonicalCapability)
  };
}
