import { decodeJson } from "./jsonService.js";
import { buildRuntimeActivityDisplay } from "./runtimeActivityDisplayService.js";

type WithExtraFields<T> = T & Record<string, unknown>;

type SerializableVaultSchema = WithExtraFields<{
  structuralTemplate: string;
}>;

type SerializableAgentPermission = WithExtraFields<{
  restrictionRules: string;
  vaultSchema?: SerializableVaultSchema | null;
}>;

type SerializableAgent = WithExtraFields<{
  capabilityManifest: string;
  permissions?: SerializableAgentPermission[];
}>;

type SerializableAgentVersion = WithExtraFields<{
  capabilityManifest: string;
}>;

type SerializableAgentDefinition = WithExtraFields<{
  versions?: SerializableAgentVersion[];
  installs?: unknown[];
}>;

type SerializableUserAgentInstall = WithExtraFields<{
  agentDefinition?: SerializableAgentDefinition | null;
  agentVersion?: SerializableAgentVersion | null;
  agent?: SerializableAgent | null;
}>;

type SerializableVaultDocument = WithExtraFields<{
  frontmatter: string;
  embedding: string;
  vaultSchema?: SerializableVaultSchema | null;
}>;

type SerializableActivityLog = WithExtraFields<{
  actionType: import("@prisma/client").ActivityActionType;
  status: import("@prisma/client").ActivityStatus;
  dataAccessed?: string | null;
  dynamicMetadata: string;
  agent?: SerializableAgent | null;
}>;

type SerializableHitlRequest = WithExtraFields<{
  payload: string;
  agent?: SerializableAgent | null;
}>;

type SerializableAgentMessage = WithExtraFields<{
  metadata: string;
}>;

type SerializableAgentConversation = WithExtraFields<{
  messages?: SerializableAgentMessage[];
  agent?: SerializableAgent | null;
}>;

export function serializeAgent<T extends SerializableAgent>(
  agent: T
) {
  return {
    ...agent,
    capabilityManifest: decodeJson(agent.capabilityManifest, {}),
    permissions: agent.permissions?.map((permission) => ({
      ...permission,
      restrictionRules: decodeJson(permission.restrictionRules, {}),
      vaultSchema: permission.vaultSchema ? serializeVaultSchema(permission.vaultSchema) : permission.vaultSchema
    }))
  };
}

export function serializeAgentVersion<T extends SerializableAgentVersion>(version: T) {
  return {
    ...version,
    capabilityManifest: decodeJson(version.capabilityManifest, {})
  };
}

export function serializeAgentDefinition<T extends SerializableAgentDefinition>(definition: T) {
  return {
    ...definition,
    versions: definition.versions?.map(serializeAgentVersion),
    installed: Boolean(definition.installs?.length)
  };
}

export function serializeUserAgentInstall<T extends SerializableUserAgentInstall>(install: T) {
  return {
    ...install,
    agentDefinition: install.agentDefinition ? serializeAgentDefinition(install.agentDefinition) : install.agentDefinition,
    agentVersion: install.agentVersion ? serializeAgentVersion(install.agentVersion) : install.agentVersion,
    agent: install.agent ? serializeAgent(install.agent) : install.agent
  };
}

export function serializeVaultSchema<T extends SerializableVaultSchema>(schema: T) {
  return { ...schema, structuralTemplate: decodeJson(schema.structuralTemplate, {}) };
}

export function serializeVaultDocument<T extends SerializableVaultDocument>(document: T) {
  return {
    ...document,
    frontmatter: decodeJson(document.frontmatter, {}),
    embedding: [],
    vaultSchema: document.vaultSchema ? serializeVaultSchema(document.vaultSchema) : document.vaultSchema
  };
}

export function serializeActivityLog<T extends SerializableActivityLog>(log: T) {
  const dynamicMetadata = decodeJson<Record<string, unknown>>(log.dynamicMetadata, {});
  const agent = log.agent ? serializeAgent(log.agent) : log.agent;
  return {
    ...log,
    dynamicMetadata,
    display: buildRuntimeActivityDisplay({
      actionType: log.actionType,
      status: log.status,
      dataAccessed: log.dataAccessed,
      metadata: dynamicMetadata,
      agentName: agent && typeof agent.name === "string" ? agent.name : undefined
    }),
    agent
  };
}

export function serializeHitlRequest<T extends SerializableHitlRequest>(request: T) {
  return {
    ...request,
    payload: decodeJson(request.payload, {}),
    agent: request.agent ? serializeAgent(request.agent) : request.agent
  };
}

export function serializeAgentMessage<T extends SerializableAgentMessage>(message: T) {
  return {
    ...message,
    metadata: decodeJson(message.metadata, {})
  };
}

export function serializeAgentConversation<T extends SerializableAgentConversation>(conversation: T) {
  return {
    ...conversation,
    messages: conversation.messages?.map(serializeAgentMessage) ?? [],
    agent: conversation.agent ? serializeAgent(conversation.agent) : conversation.agent
  };
}
