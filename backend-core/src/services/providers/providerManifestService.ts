import { badRequest } from "../../errors/httpError.js";
import { getConnectorCapability, type ConnectorAction } from "../connectorCapabilityService.js";
import type {
  ProviderActionSchema,
  ProviderAdapter,
  ProviderRiskLevel,
  ProviderSchemaFieldType
} from "./providerAdapterTypes.js";
import { canonicalProviderActionContract } from "./providerActionContractService.js";

const fieldTypes = new Set<ProviderSchemaFieldType>(["string", "number", "boolean", "date", "object", "array"]);
const connectorActions = new Set<ConnectorAction>(["search", "quote", "reserve", "prepare_action", "execute_action", "sync_status", "status", "cancel"]);

function cleanText(value: string | undefined, fallback: string, maxLength = 280) {
  return (value ?? fallback)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}

function cleanRecord(record: Record<string, unknown> | undefined, maxKeys = 12) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record ?? {}).slice(0, maxKeys)) {
    if (/secret|token|password|authorization|cookie|api[_-]?key|key$/i.test(key)) continue;
    const cleanKey = key.trim().slice(0, 80);
    if (!cleanKey) continue;
    if (typeof value === "string") safe[cleanKey] = cleanText(value, "", 200);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[cleanKey] = value;
  }
  return safe;
}

function defaultRequiredFields(capabilityKey: string) {
  if (["travel.search_hotels", "travel.search_flights", "travel.search_cars", "finance.review_spending", "health.organize_notes"].includes(capabilityKey)) return [];
  if (capabilityKey.startsWith("travel.search_")) return ["message"];
  if (capabilityKey === "travel.plan_trip") return ["message"];
  if (capabilityKey === "email.follow_up") return ["message"];
  if (capabilityKey === "finance.review_spending") return ["message"];
  return ["message"];
}

function actionNeedsApproval(action: ConnectorAction) {
  return action === "execute_action" || action === "reserve" || action === "cancel";
}

function defaultInputSchema(capabilityKey: string): ProviderActionSchema["inputSchema"] {
  const base: ProviderActionSchema["inputSchema"] = {
    message: { type: "string", description: "Natural-language request from the user." }
  };
  if (capabilityKey === "travel.search_hotels") {
    return {
      ...base,
      destination: { type: "string", description: "City, neighborhood, or destination." },
      checkIn: { type: "date", description: "Check-in date." },
      checkOut: { type: "date", description: "Check-out date." },
      guests: { type: "number", description: "Number of guests." }
    };
  }
  if (capabilityKey === "travel.search_flights") {
    return {
      ...base,
      origin: { type: "string", description: "Departure city or airport." },
      destination: { type: "string", description: "Arrival city or airport." },
      departDate: { type: "date", description: "Departure date." },
      returnDate: { type: "date", description: "Optional return date." }
    };
  }
  if (capabilityKey === "finance.review_spending") {
    return {
      ...base,
      period: { type: "string", description: "Time period to review." },
      accountType: { type: "string", description: "Account type or provider hint." }
    };
  }
  return base;
}

function defaultMissingMessage(capabilityKey: string) {
  if (capabilityKey === "travel.search_hotels") return "Add what you need, like destination or dates, before this agent can search hotels.";
  if (capabilityKey === "travel.search_flights") return "Add what you need, like route or dates, before this agent can search flights.";
  if (capabilityKey === "finance.review_spending") return "Add what you want reviewed before this agent can check finances.";
  return "Add a short request before this agent can use this provider.";
}

export function defaultProviderActionSchema(input: {
  capabilityKey: string;
  action: ConnectorAction;
  riskLevel?: ProviderRiskLevel;
  requiresApproval?: boolean;
}): ProviderActionSchema {
  const capability = getConnectorCapability(input.capabilityKey);
  const actionRequiresApproval = actionNeedsApproval(input.action);
  const capabilityKey = capability?.canonicalKey ?? input.capabilityKey;
  const canonical = canonicalProviderActionContract({
    capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel ?? (actionRequiresApproval ? "high" : capability?.risk ?? "medium"),
    requiresApproval: input.requiresApproval ?? actionRequiresApproval
  });
  return {
    ...canonical,
    inputSchema: Object.keys(canonical.inputSchema).length ? canonical.inputSchema : defaultInputSchema(capabilityKey),
    requiredFields: canonical.requiredFields.length
      ? canonical.requiredFields
      : actionRequiresApproval ? ["actionName"] : defaultRequiredFields(capabilityKey),
    missingInputMessage: canonical.missingInputMessage || (actionRequiresApproval
      ? "Choose the action this agent should perform before it can continue."
      : defaultMissingMessage(capabilityKey))
  };
}

function normalizeActionSchema(schema: ProviderActionSchema, provider: Pick<ProviderAdapter, "providerId" | "capabilities" | "actions">): ProviderActionSchema {
  const capability = getConnectorCapability(schema.capabilityKey);
  if (!capability || !provider.capabilities.includes(capability.canonicalKey)) {
    throw badRequest(`Provider '${provider.providerId}' declares an unsupported capability schema.`, "invalid_provider_manifest");
  }
  if (!provider.actions.includes(schema.action)) {
    throw badRequest(`Provider '${provider.providerId}' declares an unsupported action schema.`, "invalid_provider_manifest");
  }
  const inputSchema: ProviderActionSchema["inputSchema"] = {};
  for (const [key, value] of Object.entries(schema.inputSchema ?? {})) {
    const cleanKey = key.trim().slice(0, 80);
    if (!cleanKey || !fieldTypes.has(value.type)) continue;
    inputSchema[cleanKey] = {
      type: value.type,
      description: value.description ? cleanText(value.description, "", 180) : undefined
    };
  }
  const requiredFields = (schema.requiredFields ?? [])
    .filter((field) => typeof field === "string" && inputSchema[field])
    .slice(0, 12);
  return {
    capabilityKey: capability.canonicalKey,
    action: schema.action,
    riskLevel: actionNeedsApproval(schema.action) ? "high" : schema.riskLevel,
    requiresApproval: actionNeedsApproval(schema.action) ? true : Boolean(schema.requiresApproval),
    inputSchema,
    requiredFields,
    outputSchema: cleanRecord(schema.outputSchema, 20),
    examples: (schema.examples ?? []).slice(0, 4).map((example) => cleanRecord(example, 12)),
    userPrompt: cleanText(schema.userPrompt, `Tell this provider what you need for ${capability.label}.`),
    missingInputMessage: cleanText(schema.missingInputMessage, defaultMissingMessage(capability.canonicalKey)),
    allowExtraFields: schema.allowExtraFields !== false
  };
}

export function normalizeProviderManifest<T extends ProviderAdapter>(provider: T): T {
  const providerId = provider.providerId.trim();
  if (!providerId) throw badRequest("Provider id is required.", "invalid_provider_manifest");
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{1,119}$/.test(providerId)) {
    throw badRequest("Provider id must be a safe stable identifier.", "invalid_provider_manifest");
  }
  if (!provider.capabilities.length) throw badRequest("Provider must declare at least one capability.", "invalid_provider_manifest");
  if (!provider.actions.length) throw badRequest("Provider must declare at least one action.", "invalid_provider_manifest");
  const canonicalCapabilities = Array.from(new Set(provider.capabilities.map((capabilityKey) => {
    const capability = getConnectorCapability(capabilityKey);
    if (!capability) throw badRequest(`Provider '${providerId}' declares unknown capability '${capabilityKey}'.`, "invalid_provider_manifest");
    return capability.canonicalKey;
  })));
  const providerActions = Array.from(new Set(provider.actions.map((action) => {
    if (!connectorActions.has(action)) throw badRequest(`Provider '${providerId}' declares unknown action '${action}'.`, "invalid_provider_manifest");
    return action;
  })));
  for (const capabilityKey of provider.capabilities) {
    const capability = getConnectorCapability(capabilityKey);
    if (!capability) throw badRequest(`Provider '${providerId}' declares unknown capability '${capabilityKey}'.`, "invalid_provider_manifest");
  }
  const explicitSchemas = provider.actionSchemas ?? [];
  const normalizedSchemas = explicitSchemas.map((schema) => normalizeActionSchema(schema, {
    providerId,
    capabilities: canonicalCapabilities,
    actions: providerActions
  }));
  const schemaKeys = new Set(normalizedSchemas.map((schema) => `${schema.capabilityKey}:${schema.action}`));
  for (const capabilityKey of canonicalCapabilities) {
    const capability = getConnectorCapability(capabilityKey);
    if (!capability) continue;
    for (const action of providerActions) {
      const key = `${capability.canonicalKey}:${action}`;
      if (schemaKeys.has(key)) continue;
      normalizedSchemas.push(defaultProviderActionSchema({
        capabilityKey: capability.canonicalKey,
        action,
        riskLevel: provider.riskLevel,
        requiresApproval: actionNeedsApproval(action)
      }));
    }
  }
  return {
    ...provider,
    providerId,
    capabilities: canonicalCapabilities,
    actions: providerActions,
    actionSchemas: normalizedSchemas
  };
}

export function findProviderActionSchema(input: {
  provider: ProviderAdapter;
  capabilityKey: string;
  action: ConnectorAction;
}) {
  return (input.provider.actionSchemas ?? []).find((schema) =>
    schema.capabilityKey === input.capabilityKey && schema.action === input.action
  ) ?? defaultProviderActionSchema({
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.provider.riskLevel,
    requiresApproval: actionNeedsApproval(input.action)
  });
}

export function serializeProviderActionSchema(schema: ProviderActionSchema) {
  return {
    capabilityKey: schema.capabilityKey,
    action: schema.action,
    riskLevel: schema.riskLevel,
    requiresApproval: schema.requiresApproval,
    inputSchema: schema.inputSchema,
    requiredFields: schema.requiredFields,
    outputSchema: schema.outputSchema,
    examples: schema.examples,
    userPrompt: schema.userPrompt,
    missingInputMessage: schema.missingInputMessage,
    allowExtraFields: schema.allowExtraFields
  };
}
