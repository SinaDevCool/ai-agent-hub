import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt, sha256 } = await import("./services/cryptoService.js");
const { decodeJson, encodeJson } = await import("./services/jsonService.js");
const { embedText } = await import("./services/embeddingService.js");
const { createHitlRequest, decideHitlRequest } = await import("./services/hitlService.js");
const { runAgentForUser } = await import("./services/agentRuntimeService.js");
const { resetExternalRuntimeFetchForTest, setExternalRuntimeFetchForTest } = await import("./services/externalRuntimeProxyService.js");

const testRunId = `safety-${Date.now()}`;
let server: Server;
let baseUrl = "";

before(async () => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await prisma.activityLog.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentPermission.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userAgentInstall.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultDocument.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

afterEach(() => {
  resetExternalRuntimeFetchForTest();
});

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}

async function createConnectedAgent(input: {
  userId: string;
  name: string;
  requestedSchemas?: string[];
  highRiskActions?: string[];
  capabilityManifest?: Record<string, unknown>;
}) {
  const agent = await prisma.agent.create({
    data: {
      name: input.name,
      category: "Financial",
      apiProtocol: "MCP",
      trustScore: 75,
      capabilityManifest: encodeJson(input.capabilityManifest ?? {
        protocol: "MCP",
        tools: ["vault.search", "action.execute"],
        requestedSchemas: input.requestedSchemas ?? [],
        highRiskActions: input.highRiskActions ?? [],
        description: "Safety integration test helper."
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: input.userId,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  return agent;
}

test("authenticated API routes reject requests without a bearer token", async () => {
  const response = await fetch(`${baseUrl}/api/agents`);
  assert.equal(response.status, 401);
});

test("helpers with the same display name can exist for different users", async () => {
  const firstUser = await createUser(`${testRunId}-owner-a`);
  const secondUser = await createUser(`${testRunId}-owner-b`);
  const sharedName = `${testRunId}-Travel Helper`;

  const firstAgent = await createConnectedAgent({ userId: firstUser.id, name: sharedName });
  const secondAgent = await createConnectedAgent({ userId: secondUser.id, name: sharedName });

  assert.notEqual(firstAgent.id, secondAgent.id);
  assert.equal(firstAgent.name, secondAgent.name);
});

test("agent runtime cannot read private info before a matching permission is granted", async () => {
  const user = await createUser(`${testRunId}-permission-user`);
  const schema = await prisma.vaultSchema.upsert({
    where: { name: `${testRunId}-Financial Preferences` },
    update: {},
    create: {
      name: `${testRunId}-Financial Preferences`,
      description: "Test financial notes.",
      structuralTemplate: encodeJson({ fields: ["approvalThreshold"] })
    }
  });
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-Permission Helper`,
    requestedSchemas: [schema.name]
  });
  const textForEmbedding = "Approval threshold is 250 dollars.";
  const embedding = await embedText(textForEmbedding);
  await prisma.vaultDocument.create({
    data: {
      userId: user.id,
      vaultSchemaId: schema.id,
      title: `${testRunId} approval rule`,
      relativePath: `${testRunId}/approval-rule.md`,
      contentHash: sha256(textForEmbedding),
      frontmatter: encodeJson({ content: textForEmbedding }),
      excerpt: textForEmbedding,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    }
  });

  const blocked = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What approval threshold do I use?" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.runtimeState, "needs_permission");

  await prisma.agentPermission.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      restrictionRules: encodeJson({ deniedPaths: [], maxRecords: 8 }),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  const allowed = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What approval threshold do I use?" });
  assert.equal(allowed.status, "ok");
  assert.ok((allowed.documents?.length ?? 0) > 0);
});

test("unverified external helpers are blocked before runtime access", async () => {
  setExternalRuntimeFetchForTest(async () => {
    throw new Error("Unverified helpers must not call the network.");
  });
  const user = await createUser(`${testRunId}-external-unverified-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-External Declared Helper`,
    capabilityManifest: {
      protocol: "MCP",
      sourceType: "mcp_server",
      externalEndpointUrl: "https://external.example.test/mcp",
      verificationStatus: "declared",
      tools: ["vault.search"],
      requestedSchemas: [],
      highRiskActions: [],
      description: "Declared external helper."
    }
  });

  const result = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What should I do today?" });

  assert.equal(result.status, "blocked");
  assert.equal(result.intent, "blocked");
  assert.equal(result.runtimeState, "blocked");
  assert.match(result.reason ?? "", /verified/i);
  assert.equal(result.documents, undefined);

  const receipt = await prisma.activityLog.findFirstOrThrow({
    where: { userId: user.id, agentId: agent.id, actionType: "execution_triggered", status: "blocked_by_policy" },
    orderBy: { createdAt: "desc" }
  });
  const metadata = decodeJson<Record<string, unknown>>(receipt.dynamicMetadata, {});
  assert.equal(metadata.source, "external_agent_runtime");
  assert.equal(metadata.reason, "external_agent_not_verified");
});

test("verified external helpers still need private info permission and send only approved snippets through the proxy", async () => {
  const user = await createUser(`${testRunId}-external-permission-user`);
  const schema = await prisma.vaultSchema.upsert({
    where: { name: `${testRunId}-Travel Preferences` },
    update: {},
    create: {
      name: `${testRunId}-Travel Preferences`,
      description: "Test travel notes.",
      structuralTemplate: encodeJson({ fields: ["seatPreference"] })
    }
  });
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-External Verified Search Helper`,
    capabilityManifest: {
      protocol: "MCP",
      sourceType: "mcp_server",
      externalEndpointUrl: "https://external.example.test/mcp",
      verificationStatus: "verified",
      tools: ["vault.search"],
      requestedSchemas: [schema.name],
      highRiskActions: [],
      description: "Verified external search helper."
    }
  });
  const textForEmbedding = "Seat preference is aisle on morning flights.";
  const embedding = await embedText(textForEmbedding);
  await prisma.vaultDocument.create({
    data: {
      userId: user.id,
      vaultSchemaId: schema.id,
      title: `${testRunId} travel rule`,
      relativePath: `${testRunId}/travel-rule.md`,
      contentHash: sha256(textForEmbedding),
      frontmatter: encodeJson({ content: textForEmbedding }),
      excerpt: textForEmbedding,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    }
  });

  const missingPermission = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What seat do I prefer?" });
  assert.equal(missingPermission.status, "blocked");
  assert.equal(missingPermission.runtimeState, "needs_permission");
  assert.deepEqual(missingPermission.missingPermissions, [schema.name]);

  const proxyPayloads: Record<string, unknown>[] = [];
  setExternalRuntimeFetchForTest(async (_url, init) => {
    proxyPayloads.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new globalThis.Response(JSON.stringify({ reply: "Your seat preference is aisle.", requestId: "external-search-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  await prisma.agentPermission.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      restrictionRules: encodeJson({ deniedPaths: [], maxRecords: 8 }),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  const proxyResult = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What seat do I prefer?" });
  assert.equal(proxyResult.status, "ok");
  assert.equal(proxyResult.runtimeState, "ready");
  assert.match(proxyResult.reply, /aisle/i);
  assert.deepEqual(proxyResult.usedSchemas, [schema.name]);
  assert.ok((proxyResult.documents?.length ?? 0) > 0);
  const proxyPayload = proxyPayloads[0];
  assert.ok(proxyPayload);
  assert.equal(proxyPayload.method, "agent.run");
  const params = proxyPayload.params as { documents?: Array<{ excerpt?: string; schemaName?: string }>; usedSchemas?: string[] };
  assert.deepEqual(params.usedSchemas, [schema.name]);
  assert.equal(params.documents?.[0]?.excerpt, textForEmbedding);
  assert.equal(params.documents?.[0]?.schemaName, schema.name);

  const receipt = await prisma.activityLog.findFirstOrThrow({
    where: { userId: user.id, agentId: agent.id, actionType: "api_callback", status: "success" },
    orderBy: { createdAt: "desc" }
  });
  const metadata = decodeJson<Record<string, unknown>>(receipt.dynamicMetadata, {});
  assert.equal(metadata.source, "external_agent_runtime");
  assert.equal(metadata.proxyStatus, "executed");
  assert.equal(metadata.endpointHost, "external.example.test");
});

test("verified external high-risk actions pause for human approval before proxy execution", async () => {
  setExternalRuntimeFetchForTest(async () => {
    throw new Error("High-risk external actions must wait for human approval.");
  });
  const user = await createUser(`${testRunId}-external-hitl-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-External Action Helper`,
    capabilityManifest: {
      protocol: "OpenAPI",
      sourceType: "openapi_endpoint",
      externalEndpointUrl: "https://external.example.test/openapi.json",
      verificationStatus: "verified",
      tools: ["action.execute"],
      requestedSchemas: [],
      highRiskActions: ["transfer_funds"],
      description: "Verified external action helper."
    }
  });

  const result = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "Pay the invoice and transfer funds" });

  assert.equal(result.status, "awaiting_human_approval");
  assert.equal(result.runtimeState, "needs_approval");
  assert.equal(result.actionName, "transfer_funds");
  assert.ok(result.requestId);

  const request = await prisma.hitlRequest.findFirstOrThrow({
    where: { id: result.requestId, userId: user.id, agentId: agent.id }
  });
  const payload = decodeJson<Record<string, unknown>>(request.payload, {});
  assert.equal(payload.source, "external_agent_runtime");
  assert.equal(payload.proxyStatus, "pending_human_approval");
});

test("approved external actions execute once through the proxy and cannot be continued twice", async () => {
  const user = await createUser(`${testRunId}-external-continue-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-External Continuation Helper`,
    capabilityManifest: {
      protocol: "OpenAPI",
      sourceType: "openapi_endpoint",
      externalEndpointUrl: "https://external.example.test/run",
      verificationStatus: "verified",
      tools: ["action.execute"],
      requestedSchemas: [],
      highRiskActions: ["transfer_funds"],
      description: "Verified external action helper."
    }
  });
  const pending = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "Transfer funds for the invoice" });
  assert.equal(pending.status, "awaiting_human_approval");
  assert.ok(pending.requestId);
  await decideHitlRequest(pending.requestId, user.id, true);

  let callCount = 0;
  setExternalRuntimeFetchForTest(async (_url, init) => {
    callCount += 1;
    const payload = JSON.parse(String(init?.body ?? "{}")) as { actionName?: string };
    assert.equal(payload.actionName, "transfer_funds");
    return new globalThis.Response(JSON.stringify({ reply: "External transfer workflow prepared.", requestId: "external-action-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const firstContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(firstContinuation.status, "ok");
  assert.equal(firstContinuation.runtimeState, "ready");
  assert.equal(callCount, 1);

  const secondContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(secondContinuation.status, "blocked");
  assert.equal(callCount, 1);
});

test("external runtime blocks unsafe endpoints before network access", async () => {
  setExternalRuntimeFetchForTest(async () => {
    throw new Error("Unsafe endpoints must not call the network.");
  });
  const user = await createUser(`${testRunId}-external-unsafe-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-External Unsafe Helper`,
    capabilityManifest: {
      protocol: "OpenAPI",
      sourceType: "openapi_endpoint",
      externalEndpointUrl: "https://127.0.0.1/run",
      verificationStatus: "verified",
      tools: ["action.execute"],
      requestedSchemas: [],
      highRiskActions: [],
      description: "Unsafe endpoint helper."
    }
  });
  await prisma.agentPermission.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: null,
      permissionType: "execute_action",
      restrictionRules: encodeJson({}),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  const result = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "send the summary" });
  assert.equal(result.status, "blocked");
  assert.equal(result.runtimeState, "blocked");
  assert.equal(result.reason, "unsafe_external_endpoint");

  const receipt = await prisma.activityLog.findFirstOrThrow({
    where: { userId: user.id, agentId: agent.id, actionType: "execution_triggered", status: "blocked_by_policy" },
    orderBy: { createdAt: "desc" }
  });
  const metadata = decodeJson<Record<string, unknown>>(receipt.dynamicMetadata, {});
  assert.equal(metadata.proxyStatus, "blocked");
  assert.equal(metadata.blockedReason, "unsafe_external_endpoint");
});

test("expired approvals cannot be decided and approved actions cannot be continued twice", async () => {
  const user = await createUser(`${testRunId}-hitl-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-Approval Helper`,
    highRiskActions: ["transfer_funds"]
  });

  const expired = await createHitlRequest({
    userId: user.id,
    agentId: agent.id,
    actionName: "transfer_funds",
    payload: { amount: 10 },
    ttlMinutes: -1
  });
  await assert.rejects(
    () => decideHitlRequest(expired.id, user.id, true),
    /no longer pending or has expired/
  );

  const pending = await createHitlRequest({
    userId: user.id,
    agentId: agent.id,
    actionName: "transfer_funds",
    payload: { amount: 10 },
    ttlMinutes: 15
  });
  await decideHitlRequest(pending.id, user.id, true);

  const firstContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(firstContinuation.status, "ok");

  const secondContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(secondContinuation.status, "blocked");
});
