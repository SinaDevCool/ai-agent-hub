import assert from "node:assert/strict";
import { test } from "node:test";
import {
  serializeActivityLog,
  serializeAgent,
  serializeAgentConversation,
  serializeAgentDefinition,
  serializeHitlRequest,
  serializeUserAgentInstall,
  serializeVaultDocument
} from "./services/serializerService.js";
import { encodeJson } from "./services/jsonService.js";

test("serializeAgent decodes capability manifest and permission restrictions", () => {
  const agent = serializeAgent({
    id: "agent-1",
    capabilityManifest: encodeJson({ tools: ["vault.search"] }),
    permissions: [
      {
        id: "permission-1",
        restrictionRules: encodeJson({ fields: ["passport"] }),
        vaultSchema: {
          id: "schema-1",
          structuralTemplate: encodeJson({ fields: ["passport"] })
        }
      }
    ]
  });

  assert.deepEqual(agent.capabilityManifest, { tools: ["vault.search"] });
  assert.deepEqual(agent.permissions?.[0]?.restrictionRules, { fields: ["passport"] });
  assert.deepEqual(agent.permissions?.[0]?.vaultSchema?.structuralTemplate, { fields: ["passport"] });
});

test("serializeAgentDefinition decodes versions and preserves installed flag", () => {
  const definition = serializeAgentDefinition({
    id: "definition-1",
    versions: [
      {
        id: "version-1",
        capabilityManifest: encodeJson({ protocol: "MCP" })
      }
    ],
    installs: [{ id: "install-1" }]
  });

  assert.equal(definition.installed, true);
  assert.deepEqual(definition.versions?.[0]?.capabilityManifest, { protocol: "MCP" });
});

test("serializeUserAgentInstall decodes nested definition, version, and agent", () => {
  const install = serializeUserAgentInstall({
    id: "install-1",
    agentDefinition: {
      id: "definition-1",
      versions: [{ id: "definition-version", capabilityManifest: encodeJson({ sourceType: "native" }) }],
      installs: []
    },
    agentVersion: {
      id: "version-1",
      capabilityManifest: encodeJson({ protocol: "OpenAPI" })
    },
    agent: {
      id: "agent-1",
      capabilityManifest: encodeJson({ tools: ["action.execute"] })
    }
  });

  assert.equal(install.agentDefinition?.installed, false);
  assert.deepEqual(install.agentDefinition?.versions?.[0]?.capabilityManifest, { sourceType: "native" });
  assert.deepEqual(install.agentVersion?.capabilityManifest, { protocol: "OpenAPI" });
  assert.deepEqual(install.agent?.capabilityManifest, { tools: ["action.execute"] });
});

test("serializeVaultDocument decodes frontmatter but redacts the private search vector", () => {
  const document = serializeVaultDocument({
    id: "document-1",
    frontmatter: encodeJson({ source: "manual-entry" }),
    embedding: encodeJson([0.1, 0.2]),
    vaultSchema: {
      id: "schema-1",
      structuralTemplate: encodeJson({ fields: ["content"] })
    }
  });

  assert.deepEqual(document.frontmatter, { source: "manual-entry" });
  assert.deepEqual(document.embedding, []);
  assert.deepEqual(document.vaultSchema?.structuralTemplate, { fields: ["content"] });
});

test("serializeActivityLog and serializeHitlRequest decode nested runtime payloads", () => {
  const activity = serializeActivityLog({
    id: "activity-1",
    actionType: "hitl_requested",
    status: "pending_human_approval",
    dynamicMetadata: encodeJson({ requestId: "request-1" }),
    agent: {
      id: "agent-1",
      capabilityManifest: encodeJson({ tools: ["vault.search"] })
    }
  });
  const request = serializeHitlRequest({
    id: "request-1",
    payload: encodeJson({ action: "book" }),
    agent: {
      id: "agent-1",
      capabilityManifest: encodeJson({ highRiskActions: ["book_non_refundable_travel"] })
    }
  });

  assert.deepEqual(activity.dynamicMetadata, { requestId: "request-1" });
  assert.deepEqual(activity.agent?.capabilityManifest, { tools: ["vault.search"] });
  assert.deepEqual(request.payload, { action: "book" });
  assert.deepEqual(request.agent?.capabilityManifest, { highRiskActions: ["book_non_refundable_travel"] });
});

test("serializeAgentConversation decodes messages and defaults missing message list", () => {
  const conversation = serializeAgentConversation({
    id: "conversation-1",
    messages: [
      {
        id: "message-1",
        metadata: encodeJson({ runtimeState: "ready" })
      }
    ],
    agent: {
      id: "agent-1",
      capabilityManifest: encodeJson({ description: "Test helper" })
    }
  });
  const emptyConversation = serializeAgentConversation({
    id: "conversation-2"
  });

  assert.deepEqual(conversation.messages[0]?.metadata, { runtimeState: "ready" });
  assert.deepEqual(conversation.agent?.capabilityManifest, { description: "Test helper" });
  assert.deepEqual(emptyConversation.messages, []);
});
