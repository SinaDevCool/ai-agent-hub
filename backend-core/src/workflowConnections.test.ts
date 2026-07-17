import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { runAgentForUser } from "./services/agentRuntimeService.js";
import { executeTool } from "./services/toolExecutionService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";

const testRunId = `workflow-connections-${Date.now()}`;
let server: Server;
let baseUrl = "";

before(async () => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  resetWebhookFetchForTest();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.workflowConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

async function createUserAndAgent(suffix: string) {
  const user = await prisma.user.create({
    data: {
      id: `${testRunId}-${suffix}`,
      email: `${testRunId}-${suffix}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
  const agent = await prisma.agent.create({
    data: {
      name: `${testRunId}-${suffix}-agent`,
      category: "Custom",
      apiProtocol: "MCP",
      trustScore: 80,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["workflow.run"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Workflow connection test agent."
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  return { user, agent };
}

async function apiPost(path: string, userId: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body)
  });
}

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: { "x-user-id": userId }
  });
}

test("workflow API rejects unsafe webhook URLs with a readable error", async () => {
  const { user, agent } = await createUserAndAgent("unsafe");
  const response = await apiPost("/api/workflows", user.id, {
    name: "Unsafe local workflow",
    provider: "n8n",
    endpointUrl: "http://localhost:5678/webhook/test",
    agentId: agent.id
  });

  assert.equal(response.status, 400);
  const body = await response.json() as { error: { message: string; code: string } };
  assert.equal(body.error.code, "unsafe_workflow_url");
  assert.match(body.error.message, /HTTPS|localhost/i);
});

test("workflow API exposes supported capabilities and rejects unknown capabilities", async () => {
  const { user, agent } = await createUserAndAgent("capability-catalog");

  const catalogResponse = await apiGet("/api/workflows/capabilities", user.id);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json() as { capabilities: Array<{ key: string; label: string; contract?: { receives: unknown; returns: unknown; requiredFields: string[] } }> };
  assert.ok(catalog.capabilities.some((capability) => capability.key === "travel.search_hotels" && capability.label === "Find hotels"));
  const hotelCapability = catalog.capabilities.find((capability) => capability.key === "travel.search_hotels");
  assert.ok(hotelCapability?.contract);
  assert.ok(hotelCapability.contract.requiredFields.includes("hotels[].name"));

  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Unknown ability workflow",
    provider: "n8n",
    capabilityKey: "travel.teleport",
    endpointUrl: "https://workflow.example.test/unknown",
    agentId: agent.id
  });
  assert.equal(createResponse.status, 400);
  const body = await createResponse.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "unknown_workflow_capability");
  assert.match(body.error.message, /supported workflow ability/i);
});

test("workflow API creates, lists, and scopes workflows to the signed-in user", async () => {
  const { user, agent } = await createUserAndAgent("scoped-owner");
  const outsider = await createUserAndAgent("scoped-outsider");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Travel search workflow",
    provider: "n8n",
    capabilityKey: "travel.search_hotels",
    description: "Finds hotel options.",
    endpointUrl: "https://workflow.example.test/travel",
    agentId: agent.id
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as { workflow: { id: string; status: string; capabilityKey: string; description: string }; signingSecret: string };
  assert.equal(created.workflow.status, "draft");
  assert.equal(created.workflow.capabilityKey, "travel.search_hotels");
  assert.equal(created.workflow.description, "Finds hotel options.");
  assert.ok(created.signingSecret.length > 20);

  const ownerList = await apiGet("/api/workflows", user.id);
  const ownerBody = await ownerList.json() as { workflows: Array<{ id: string; name: string }> };
  assert.deepEqual(ownerBody.workflows.map((workflow) => workflow.id), [created.workflow.id]);

  const outsiderList = await apiGet("/api/workflows", outsider.user.id);
  const outsiderBody = await outsiderList.json() as { workflows: Array<{ id: string }> };
  assert.deepEqual(outsiderBody.workflows, []);
});

test("testing a workflow sends a signed payload and activates the connection", async () => {
  const { user, agent } = await createUserAndAgent("signed-test");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Signed workflow",
    provider: "make",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/signed",
    agentId: agent.id
  });
  const created = await createResponse.json() as { workflow: { id: string } };

  setWebhookFetchForTest(async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "workflow.example.test");
    assert.equal(init?.headers && (init.headers as Record<string, string>)["x-agent-hub-workflow-id"], created.workflow.id);
    assert.ok(init?.headers && (init.headers as Record<string, string>)["x-agent-hub-signature"]);
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.workflowConnectionId, created.workflow.id);
    assert.equal(payload.agentId, agent.id);
    assert.equal(payload.toolName, "workflow.run");
    assert.equal(payload.capabilityKey, "travel.search_hotels");
    return new Response(JSON.stringify({ reply: "Workflow test is ready.", requestId: "workflow-test-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const testResponse = await apiPost(`/api/workflows/${created.workflow.id}/test`, user.id);
  assert.equal(testResponse.status, 200);
  const body = await testResponse.json() as { ok: boolean; workflow: { status: string }; result: { reply: string } };
  assert.equal(body.ok, true);
  assert.equal(body.workflow.status, "active");
  assert.equal(body.result.reply, "Workflow test is ready.");
});

test("workflow.run executes through the active database-backed workflow", async () => {
  const { user, agent } = await createUserAndAgent("runtime");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Runtime workflow",
    provider: "zapier",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/runtime",
    agentId: agent.id
  });
  const created = await createResponse.json() as { workflow: { id: string } };

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "Runtime workflow answered." }), { status: 200 }));
  await apiPost(`/api/workflows/${created.workflow.id}/test`, user.id);

  setWebhookFetchForTest(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.toolRunId && typeof payload.toolRunId === "string", true);
    assert.equal(payload.input && (payload.input as Record<string, unknown>).destination, "Berlin");
    return new Response(JSON.stringify({ reply: "Found options from the connected workflow." }), { status: 200 });
  });

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: "workflow.run",
    arguments: { destination: "Berlin", capabilityKey: "travel.search_hotels" }
  });

  assert.equal(result.status, "ok");
  assert.equal(result.result?.workflowConnectionId, created.workflow.id);
  assert.equal(result.result?.capabilityKey, "travel.search_hotels");
  assert.equal(result.result?.reply, "Found options from the connected workflow.");
});

test("workflow.run normalizes hotel webhook results for B2C chat cards", async () => {
  const { user, agent } = await createUserAndAgent("normalized-hotels");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Hotel search workflow",
    provider: "n8n",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/hotels",
    agentId: agent.id
  });
  const created = await createResponse.json() as { workflow: { id: string } };

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "ready" }), { status: 200 }));
  await apiPost(`/api/workflows/${created.workflow.id}/test`, user.id);

  setWebhookFetchForTest(async () => new Response(JSON.stringify({
    summary: "I found two stays near the center.",
    hotels: [
      { name: "Central Lisbon Stay", location: "Baixa", price: "$145/night", bookingUrl: "https://example.test/hotel-1", rating: "4.7" },
      { name: "Riverside Rooms", location: "Alfama", price: "$132/night" }
    ],
    requestId: "hotel-search-1"
  }), { status: 200 }));

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: "workflow.run",
    arguments: { message: "Find hotels in Lisbon" }
  });

  assert.equal(result.status, "ok");
  assert.equal(result.result?.workflowConnectionId, created.workflow.id);
  const workflowResult = result.result?.workflowResult as { title: string; summary: string; quality: string; items: Array<{ title: string; price?: string; url?: string }>; receipt: { capabilityLabel: string } };
  assert.equal(workflowResult.title, "Hotel options found");
  assert.equal(workflowResult.quality, "complete");
  assert.equal(workflowResult.summary, "I found two stays near the center.");
  assert.equal(workflowResult.receipt.capabilityLabel, "Find hotels");
  assert.equal(workflowResult.items[0].title, "Central Lisbon Stay");
  assert.equal(workflowResult.items[0].price, "$145/night");
  assert.equal(workflowResult.items[0].url, "https://example.test/hotel-1");
});

test("agent chat uses connected workflow for matched automation tasks", async () => {
  const { user, agent } = await createUserAndAgent("chat-workflow");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Agent hotel finder",
    provider: "make",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/chat-hotels",
    agentId: agent.id
  });
  const created = await createResponse.json() as { workflow: { id: string } };

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "ready" }), { status: 200 }));
  await apiPost(`/api/workflows/${created.workflow.id}/test`, user.id);

  setWebhookFetchForTest(async () => new Response(JSON.stringify({
    hotels: [{ name: "Simple Stay", location: "Mitte", price: "€120/night" }]
  }), { status: 200 }));

  const result = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "Find hotels in Berlin next weekend for 2 guests"
  });

  assert.equal(result.status, "ok");
  assert.equal(result.intent, "workflow");
  assert.equal(result.provider, "workflow");
  assert.match(result.reply, /Agent hotel finder/);
  assert.equal(result.workflowResult?.items[0]?.title, "Simple Stay");
  assert.equal(result.workflowResult?.receipt.workflowConnectionId, created.workflow.id);
  assert.equal(result.providerReceipt?.providerLabel, "Connected workflow");
  assert.equal(result.providerReceipt?.display.title, "Hotel options found");
  assert.equal(result.providerReceipt?.display.externalService, "Agent hotel finder");
  assert.equal(result.providerReceipt?.display.summary, "Find hotels found 1 option using Agent hotel finder.");

  const conversation = result.conversation as {
    messages?: Array<{
      role: string;
      metadata: { providerReceipt?: { id?: string; display?: { title?: string } } };
    }>;
  } | undefined;
  const agentMessage = conversation?.messages?.find((message) => message.role === "agent");
  assert.equal(agentMessage?.metadata.providerReceipt?.id, result.providerReceipt?.id);
  assert.equal(agentMessage?.metadata.providerReceipt?.display?.title, "Hotel options found");
});

test("workflow.run routes by capability and falls back to a global matching workflow", async () => {
  const { user, agent } = await createUserAndAgent("routing");
  const otherAgent = await prisma.agent.create({
    data: {
      name: `${testRunId}-routing-other-agent`,
      category: "Custom",
      apiProtocol: "MCP",
      trustScore: 80,
      capabilityManifest: encodeJson({ protocol: "MCP", tools: ["workflow.run"] })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: otherAgent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });

  const globalResponse = await apiPost("/api/workflows", user.id, {
    name: "Global flight workflow",
    provider: "n8n",
    capabilityKey: "travel.search_flights",
    endpointUrl: "https://workflow.example.test/global-flights",
    agentId: null
  });
  const globalCreated = await globalResponse.json() as { workflow: { id: string } };

  const agentResponse = await apiPost("/api/workflows", user.id, {
    name: "Agent hotel workflow",
    provider: "n8n",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/agent-hotels",
    agentId: agent.id
  });
  const agentCreated = await agentResponse.json() as { workflow: { id: string } };

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "ready" }), { status: 200 }));
  await apiPost(`/api/workflows/${globalCreated.workflow.id}/test`, user.id);
  await apiPost(`/api/workflows/${agentCreated.workflow.id}/test`, user.id);

  setWebhookFetchForTest(async (url) => {
    assert.equal(new URL(String(url)).pathname, "/agent-hotels");
    return new Response(JSON.stringify({ reply: "Hotel workflow used." }), { status: 200 });
  });
  const hotelResult = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: "workflow.run",
    arguments: { message: "Find hotels in Lisbon" }
  });
  assert.equal(hotelResult.status, "ok");
  assert.equal(hotelResult.result?.workflowConnectionId, agentCreated.workflow.id);

  setWebhookFetchForTest(async (url) => {
    assert.equal(new URL(String(url)).pathname, "/global-flights");
    return new Response(JSON.stringify({ reply: "Flight workflow used." }), { status: 200 });
  });
  const flightResult = await executeTool({
    userId: user.id,
    agentId: otherAgent.id,
    toolName: "workflow.run",
    arguments: { message: "Find flights to Lisbon" }
  });
  assert.equal(flightResult.status, "ok");
  assert.equal(flightResult.result?.workflowConnectionId, globalCreated.workflow.id);
});

test("workflow.run skips disabled workflows and returns a clear missing-capability message", async () => {
  const { user, agent } = await createUserAndAgent("missing");
  const createResponse = await apiPost("/api/workflows", user.id, {
    name: "Disabled hotel workflow",
    provider: "n8n",
    capabilityKey: "travel.search_hotels",
    endpointUrl: "https://workflow.example.test/disabled-hotels",
    agentId: agent.id
  });
  const created = await createResponse.json() as { workflow: { id: string } };
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "ready" }), { status: 200 }));
  await apiPost(`/api/workflows/${created.workflow.id}/test`, user.id);
  await fetch(`${baseUrl}/api/workflows/${created.workflow.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-user-id": user.id },
    body: JSON.stringify({ status: "disabled" })
  });

  setWebhookFetchForTest(async () => {
    throw new Error("Disabled workflow should not be called.");
  });
  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: "workflow.run",
    arguments: { message: "Find hotels in Rome" }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.reason, /Find hotels/);
  assert.match(result.reason, /Connect a workflow/);
});
