import { decodeJson } from "./jsonService.js";

export function serializeAgent<T extends { capabilityManifest: string; permissions?: Array<{ restrictionRules: string; vaultSchema?: any }> }>(
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

export function serializeAgentVersion<T extends { capabilityManifest: string }>(version: T) {
  return {
    ...version,
    capabilityManifest: decodeJson(version.capabilityManifest, {})
  };
}

export function serializeAgentDefinition(definition: any) {
  return {
    ...definition,
    versions: definition.versions?.map(serializeAgentVersion),
    installed: Boolean(definition.installs?.length)
  };
}

export function serializeUserAgentInstall(install: any) {
  return {
    ...install,
    agentDefinition: install.agentDefinition ? serializeAgentDefinition(install.agentDefinition) : install.agentDefinition,
    agentVersion: install.agentVersion ? serializeAgentVersion(install.agentVersion) : install.agentVersion,
    agent: install.agent ? serializeAgent(install.agent) : install.agent
  };
}

export function serializeVaultSchema<T extends { structuralTemplate: string }>(schema: T) {
  return { ...schema, structuralTemplate: decodeJson(schema.structuralTemplate, {}) };
}

export function serializeVaultDocument<T extends { frontmatter: string; embedding: string; vaultSchema?: any }>(document: T) {
  return {
    ...document,
    frontmatter: decodeJson(document.frontmatter, {}),
    embedding: decodeJson(document.embedding, []),
    vaultSchema: document.vaultSchema ? serializeVaultSchema(document.vaultSchema) : document.vaultSchema
  };
}

export function serializeActivityLog<T extends { dynamicMetadata: string; agent?: any }>(log: T) {
  return {
    ...log,
    dynamicMetadata: decodeJson(log.dynamicMetadata, {}),
    agent: log.agent ? serializeAgent(log.agent) : log.agent
  };
}

export function serializeHitlRequest<T extends { payload: string; agent?: any }>(request: T) {
  return {
    ...request,
    payload: decodeJson(request.payload, {}),
    agent: request.agent ? serializeAgent(request.agent) : request.agent
  };
}

export function serializeAgentMessage<T extends { metadata: string }>(message: T) {
  return {
    ...message,
    metadata: decodeJson(message.metadata, {})
  };
}

export function serializeAgentConversation<T extends { messages?: Array<{ metadata: string }>; agent?: any }>(conversation: T) {
  return {
    ...conversation,
    messages: conversation.messages?.map(serializeAgentMessage) ?? [],
    agent: conversation.agent ? serializeAgent(conversation.agent) : conversation.agent
  };
}
