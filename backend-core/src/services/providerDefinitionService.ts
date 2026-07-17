import type { ProviderDefinition } from "@prisma/client";
import { logger } from "../config/logger.js";
import { prisma } from "../db/prisma.js";
import { badRequest, notFound } from "../errors/httpError.js";
import { getConnectorCapability, type ConnectorAction } from "./connectorCapabilityService.js";
import {
  registerConnectorProvider,
  unregisterConnectorProvider,
  type ConnectorProviderDefinition
} from "./connectorProviderRegistryService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import type {
  ProviderAdapter,
  ProviderActionSchema,
  ProviderAuthType,
  ProviderCredentialField,
  ProviderCredentialFieldType,
  ProviderCredentialType,
  ProviderKind,
  ProviderOAuthConfig,
  ProviderRiskLevel,
  ProviderRuntimeConfig
} from "./providers/providerAdapterTypes.js";
import { normalizeProviderManifest } from "./providers/providerManifestService.js";

export type ProviderDefinitionStatus = "draft" | "active" | "disabled";

type ProviderDefinitionInput = {
  providerId?: string;
  label?: string;
  kind?: ProviderKind;
  toolName?: string;
  description?: string;
  capabilities?: string[];
  actions?: ConnectorAction[];
  actionSchemas?: ProviderActionSchema[];
  runtimeConfig?: ProviderRuntimeConfig;
  credentialType?: ProviderCredentialType;
  credentialFields?: ProviderCredentialField[];
  oauthConfig?: ProviderOAuthConfig;
  authType?: ProviderAuthType;
  riskLevel?: ProviderRiskLevel;
  requiresConnectedAccount?: boolean;
  supportsHealthCheck?: boolean;
  status?: ProviderDefinitionStatus;
};

const providerKinds = new Set<ProviderKind>(["workflow", "oauth_api", "native", "mcp", "openapi", "api", "browser", "manual"]);
const authTypes = new Set<ProviderAuthType>(["none", "api_key", "oauth", "connected_account", "mcp", "workflow_secret"]);
const credentialTypes = new Set<ProviderCredentialType>(["none", "api_key", "oauth", "connected_account", "bearer_token"]);
const credentialFieldTypes = new Set<ProviderCredentialFieldType>(["text", "password", "url", "email"]);
const riskLevels = new Set<ProviderRiskLevel>(["low", "medium", "high"]);
const actions = new Set<ConnectorAction>(["search", "quote", "reserve", "prepare_action", "execute_action", "sync_status", "status", "cancel"]);
const statuses = new Set<ProviderDefinitionStatus>(["draft", "active", "disabled"]);

function cleanString(value: unknown, fallback = "", maxLength = 240) {
  return (typeof value === "string" ? value : fallback)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasSecretKey(key: string) {
  return /secret|token|password|authorization|cookie|api[_-]?key|key$/i.test(key);
}

function assertNoSecretRuntimeConfig(value: unknown, path = "runtimeConfig") {
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const currentPath = `${path}.${key}`;
    if (hasSecretKey(key) && ![
      "runtimeConfig.authHeaderName",
      "runtimeConfig.authCredentialKey",
      "oauthConfig.clientIdEnvKey",
      "oauthConfig.clientSecretEnvKey"
    ].includes(currentPath)) {
      throw badRequest("Runtime config must reference secrets by credential name, not store secret values.", "provider_secret_not_allowed");
    }
    if (isRecord(nested)) assertNoSecretRuntimeConfig(nested, currentPath);
  }
}

function sanitizePublicRecord(record: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (hasSecretKey(key) && !["authHeaderName", "authCredentialKey"].includes(key)) continue;
    if (isRecord(value)) safe[key] = sanitizePublicRecord(value);
    else if (Array.isArray(value)) safe[key] = value.slice(0, 12).map((item) => isRecord(item) ? sanitizePublicRecord(item) : item);
    else safe[key] = value;
  }
  return safe;
}

function cleanKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,63}$/.test(key)) {
    throw badRequest("Credential field keys must be safe identifiers.", "invalid_credential_field");
  }
  if (hasSecretKey(key) && !["apiKey", "bearerToken", "accessToken", "refreshToken"].includes(key)) {
    throw badRequest("Credential field keys must use predictable safe names.", "invalid_credential_field");
  }
  return key;
}

function normalizeCredentialFields(fields: ProviderCredentialField[]) {
  return fields.slice(0, 20).map((field) => {
    const key = cleanKey(field.key);
    const type = credentialFieldTypes.has(field.type) ? field.type : "password";
    return {
      key,
      label: cleanString(field.label, key, 120),
      type,
      required: Boolean(field.required),
      helpText: field.helpText ? cleanString(field.helpText, "", 240) : undefined,
      placeholder: field.placeholder ? cleanString(field.placeholder, "", 120) : undefined
    };
  });
}

function normalizeOAuthConfig(config: ProviderOAuthConfig) {
  const normalized: ProviderOAuthConfig = {
    authUrl: cleanString(config.authUrl, "", 500),
    tokenUrl: cleanString(config.tokenUrl, "", 500),
    scopes: (config.scopes ?? []).filter((scope) => typeof scope === "string").map((scope) => cleanString(scope, "", 120)).filter(Boolean).slice(0, 40),
    clientIdEnvKey: cleanString(config.clientIdEnvKey, "", 120),
    clientSecretEnvKey: cleanString(config.clientSecretEnvKey, "", 120),
    redirectPath: cleanString(config.redirectPath, "/api/provider-connections/oauth/callback", 200)
  };
  assertNoSecretRuntimeConfig(normalized, "oauthConfig");
  if (!normalized.authUrl || !normalized.tokenUrl || !normalized.clientIdEnvKey || !normalized.clientSecretEnvKey) {
    throw badRequest("OAuth providers must declare auth URL, token URL, and env-key references.", "invalid_oauth_config");
  }
  return normalized;
}

function parseArray<T>(value: string) {
  const decoded = decodeJson<unknown>(value, []);
  return Array.isArray(decoded) ? decoded as T[] : [];
}

function parseRecord<T extends Record<string, unknown>>(value: string) {
  const decoded = decodeJson<unknown>(value, {});
  return isRecord(decoded) ? decoded as T : {} as T;
}

function normalizeInput(input: ProviderDefinitionInput, existing?: ProviderDefinition): Required<Omit<ProviderDefinitionInput, "description" | "actionSchemas" | "runtimeConfig">> & {
  description: string;
  actionSchemas: ProviderActionSchema[];
  runtimeConfig: ProviderRuntimeConfig;
} {
  const providerId = cleanString(input.providerId ?? existing?.providerId, "", 100);
  const label = cleanString(input.label ?? existing?.label, "", 140);
  const kind = input.kind ?? existing?.kind as ProviderKind | undefined;
  const toolName = cleanString(input.toolName ?? existing?.toolName ?? `${providerId}.runtime`, `${providerId}.runtime`, 140);
  const description = cleanString(input.description ?? existing?.description, "", 500);
  const capabilities = input.capabilities ?? (existing ? parseArray<string>(existing.capabilitiesJson) : []);
  const providerActions = input.actions ?? (existing ? parseArray<ConnectorAction>(existing.actionsJson) : []);
  const actionSchemas = input.actionSchemas ?? (existing ? parseArray<ProviderActionSchema>(existing.actionSchemasJson) : []);
  const runtimeConfig = input.runtimeConfig ?? (existing ? parseRecord<ProviderRuntimeConfig>(existing.runtimeConfigJson) : {});
  const credentialType = input.credentialType ?? existing?.credentialType as ProviderCredentialType | undefined ?? "none";
  const credentialFields = input.credentialFields ?? (existing ? parseArray<ProviderCredentialField>(existing.credentialFieldsJson) : []);
  const oauthConfig = input.oauthConfig ?? (existing ? parseRecord<ProviderOAuthConfig>(existing.oauthConfigJson) : {});
  let authType = input.authType ?? existing?.authType as ProviderAuthType | undefined ?? "none";
  const riskLevel = input.riskLevel ?? existing?.riskLevel as ProviderRiskLevel | undefined ?? "medium";
  let requiresConnectedAccount = input.requiresConnectedAccount ?? existing?.requiresConnectedAccount ?? false;
  const supportsHealthCheck = input.supportsHealthCheck ?? existing?.supportsHealthCheck ?? false;
  const status = input.status ?? existing?.status as ProviderDefinitionStatus | undefined ?? "draft";

  if (!providerId) throw badRequest("Provider id is required.", "invalid_provider_definition");
  if (!label) throw badRequest("Provider label is required.", "invalid_provider_definition");
  if (!kind || !providerKinds.has(kind)) throw badRequest("Provider kind is not supported.", "invalid_provider_definition");
  if (!toolName) throw badRequest("Provider tool name is required.", "invalid_provider_definition");
  if (!credentialTypes.has(credentialType)) throw badRequest("Provider credential type is not supported.", "invalid_provider_definition");
  if (credentialType !== "none") requiresConnectedAccount = true;
  if (!input.authType && (!existing || existing.authType === "none")) {
    if (credentialType === "oauth") authType = "oauth";
    else if (credentialType === "api_key" || credentialType === "bearer_token") authType = "api_key";
    else if (credentialType === "connected_account") authType = "connected_account";
  }
  if (!authTypes.has(authType)) throw badRequest("Provider auth type is not supported.", "invalid_provider_definition");
  if (!riskLevels.has(riskLevel)) throw badRequest("Provider risk level is not supported.", "invalid_provider_definition");
  if (!statuses.has(status)) throw badRequest("Provider status is not supported.", "invalid_provider_definition");
  if (!capabilities.length) throw badRequest("Provider must declare at least one capability.", "invalid_provider_definition");
  if (!providerActions.length) throw badRequest("Provider must declare at least one action.", "invalid_provider_definition");
  const canonicalCapabilities = capabilities.map((capabilityKey) => {
    const capability = getConnectorCapability(capabilityKey);
    if (!capability) throw badRequest(`Unknown capability '${capabilityKey}'.`, "invalid_provider_definition");
    return capability.canonicalKey;
  });
  for (const action of providerActions) {
    if (!actions.has(action)) throw badRequest(`Unsupported provider action '${action}'.`, "invalid_provider_definition");
  }
  assertNoSecretRuntimeConfig(runtimeConfig);
  const normalizedCredentialFields = normalizeCredentialFields(credentialFields);
  const normalizedOAuthConfig = credentialType === "oauth" ? normalizeOAuthConfig(oauthConfig) : {};
  if ((credentialType === "api_key" || credentialType === "bearer_token" || credentialType === "connected_account") && !normalizedCredentialFields.some((field) => field.required)) {
    throw badRequest("Credentialed providers must declare at least one required credential field.", "invalid_credential_fields");
  }

  const normalizedDefinition: ConnectorProviderDefinition = {
    providerId,
    label,
    kind,
    toolName,
    capabilities: canonicalCapabilities,
    actions: providerActions,
    actionSchemas,
    runtimeConfig,
    credentialType,
    credentialFields: normalizedCredentialFields,
    oauthConfig: normalizedOAuthConfig,
    authType,
    riskLevel,
    requiresConnectedAccount,
    supportsHealthCheck,
    description
  };
  const validationAdapter: ProviderAdapter = {
    ...normalizedDefinition,
    authType,
    riskLevel,
    actionSchemas,
    runtimeConfig,
    supportsHealthCheck,
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== providerId) return false;
      return canonicalCapabilities.includes(input.capabilityKey) && providerActions.includes(input.action);
    },
    execute: async () => ({ status: "blocked", toolRunId: "validation", reason: "validation" })
  };
  const normalizedManifest = normalizeProviderManifest(validationAdapter);

  return {
    providerId,
    label,
    kind,
    toolName,
    description,
    capabilities: normalizedManifest.capabilities,
    actions: normalizedManifest.actions,
    actionSchemas: normalizedManifest.actionSchemas ?? [],
    runtimeConfig,
    credentialType,
    credentialFields: normalizedCredentialFields,
    oauthConfig: normalizedOAuthConfig,
    authType,
    riskLevel,
    requiresConnectedAccount,
    supportsHealthCheck,
    status
  };
}

export function providerDefinitionToConnectorProvider(definition: ProviderDefinition): ConnectorProviderDefinition {
  return {
    providerId: definition.providerId,
    label: definition.label,
    kind: definition.kind as ProviderKind,
    toolName: definition.toolName,
    capabilities: parseArray<string>(definition.capabilitiesJson),
    actions: parseArray<ConnectorAction>(definition.actionsJson),
    actionSchemas: parseArray<ProviderActionSchema>(definition.actionSchemasJson),
    runtimeConfig: parseRecord<ProviderRuntimeConfig>(definition.runtimeConfigJson),
    credentialType: definition.credentialType as ProviderCredentialType,
    credentialFields: parseArray<ProviderCredentialField>(definition.credentialFieldsJson),
    oauthConfig: parseRecord<ProviderOAuthConfig>(definition.oauthConfigJson),
    authType: definition.authType as ProviderAuthType,
    riskLevel: definition.riskLevel as ProviderRiskLevel,
    requiresConnectedAccount: definition.requiresConnectedAccount,
    supportsHealthCheck: definition.supportsHealthCheck,
    description: definition.description
  };
}

export function serializeProviderDefinition(definition: ProviderDefinition) {
  return {
    id: definition.id,
    providerId: definition.providerId,
    label: definition.label,
    kind: definition.kind,
    toolName: definition.toolName,
    description: definition.description,
    capabilities: parseArray<string>(definition.capabilitiesJson),
    actions: parseArray<ConnectorAction>(definition.actionsJson),
    actionSchemas: parseArray<ProviderActionSchema>(definition.actionSchemasJson),
    runtimeConfig: sanitizePublicRecord(parseRecord<Record<string, unknown>>(definition.runtimeConfigJson)),
    credentialType: definition.credentialType,
    credentialFields: parseArray<ProviderCredentialField>(definition.credentialFieldsJson),
    oauthConfig: sanitizePublicRecord(parseRecord<Record<string, unknown>>(definition.oauthConfigJson)),
    authType: definition.authType,
    riskLevel: definition.riskLevel,
    requiresConnectedAccount: definition.requiresConnectedAccount,
    supportsHealthCheck: definition.supportsHealthCheck,
    healthStatus: definition.healthStatus,
    healthFailureCode: definition.healthFailureCode,
    healthFailureMessage: definition.healthFailureMessage,
    healthCheckedAt: definition.healthCheckedAt?.toISOString() ?? null,
    healthLastSuccessAt: definition.healthLastSuccessAt?.toISOString() ?? null,
    healthLastFailureAt: definition.healthLastFailureAt?.toISOString() ?? null,
    status: definition.status,
    createdByUserId: definition.createdByUserId,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString()
  };
}

export async function syncProviderDefinitionToRegistry(definition: ProviderDefinition) {
  unregisterConnectorProvider(definition.providerId);
  if (definition.status !== "active") return;
  registerConnectorProvider(providerDefinitionToConnectorProvider(definition));
}

export async function loadActiveProviderDefinitionsIntoRegistry() {
  const definitions = await prisma.providerDefinition.findMany({ where: { status: "active" } });
  for (const definition of definitions) {
    try {
      await syncProviderDefinitionToRegistry(definition);
    } catch (error) {
      logger.warn({ providerId: definition.providerId, error }, "skipping invalid persisted provider definition");
      unregisterConnectorProvider(definition.providerId);
    }
  }
  return definitions.length;
}

export async function listProviderDefinitions() {
  const definitions = await prisma.providerDefinition.findMany({ orderBy: [{ status: "asc" }, { label: "asc" }] });
  return definitions.map(serializeProviderDefinition);
}

export async function createProviderDefinition(userId: string, input: ProviderDefinitionInput) {
  const normalized = normalizeInput(input);
  const created = await prisma.providerDefinition.create({
    data: {
      providerId: normalized.providerId,
      label: normalized.label,
      kind: normalized.kind,
      toolName: normalized.toolName,
      description: normalized.description,
      capabilitiesJson: encodeJson(normalized.capabilities),
      actionsJson: encodeJson(normalized.actions),
      actionSchemasJson: encodeJson(normalized.actionSchemas),
      runtimeConfigJson: encodeJson(normalized.runtimeConfig),
      credentialType: normalized.credentialType,
      credentialFieldsJson: encodeJson(normalized.credentialFields),
      oauthConfigJson: encodeJson(normalized.oauthConfig),
      authType: normalized.authType,
      riskLevel: normalized.riskLevel,
      requiresConnectedAccount: normalized.requiresConnectedAccount,
      supportsHealthCheck: normalized.supportsHealthCheck,
      status: normalized.status,
      createdByUserId: userId
    }
  });
  await syncProviderDefinitionToRegistry(created);
  return serializeProviderDefinition(created);
}

export async function updateProviderDefinition(id: string, input: ProviderDefinitionInput) {
  const existing = await prisma.providerDefinition.findUnique({ where: { id } });
  if (!existing) throw notFound("Provider definition not found.", "provider_definition_not_found");
  const normalized = normalizeInput(input, existing);
  const updated = await prisma.providerDefinition.update({
    where: { id },
    data: {
      providerId: normalized.providerId,
      label: normalized.label,
      kind: normalized.kind,
      toolName: normalized.toolName,
      description: normalized.description,
      capabilitiesJson: encodeJson(normalized.capabilities),
      actionsJson: encodeJson(normalized.actions),
      actionSchemasJson: encodeJson(normalized.actionSchemas),
      runtimeConfigJson: encodeJson(normalized.runtimeConfig),
      credentialType: normalized.credentialType,
      credentialFieldsJson: encodeJson(normalized.credentialFields),
      oauthConfigJson: encodeJson(normalized.oauthConfig),
      authType: normalized.authType,
      riskLevel: normalized.riskLevel,
      requiresConnectedAccount: normalized.requiresConnectedAccount,
      supportsHealthCheck: normalized.supportsHealthCheck,
      status: normalized.status
    }
  });
  if (updated.providerId !== existing.providerId) unregisterConnectorProvider(existing.providerId);
  await syncProviderDefinitionToRegistry(updated);
  return serializeProviderDefinition(updated);
}

export async function setProviderDefinitionStatus(id: string, status: ProviderDefinitionStatus) {
  if (!statuses.has(status)) throw badRequest("Provider status is not supported.", "invalid_provider_definition");
  const updated = await prisma.providerDefinition.update({
    where: { id },
    data: { status }
  }).catch(() => {
    throw notFound("Provider definition not found.", "provider_definition_not_found");
  });
  await syncProviderDefinitionToRegistry(updated);
  return serializeProviderDefinition(updated);
}
