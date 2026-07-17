import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt, sha256 } from "./services/cryptoService.js";
import { embedText } from "./services/embeddingService.js";
import { encodeJson } from "./services/jsonService.js";

const testRunId = `agent-runtime-api-${Date.now()}`;
let server: Server;
let baseUrl = "";

type RuntimeResponse = {
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: string;
  reply: string;
  display?: {
    title: string;
    body: string;
    badge: string;
    category: string;
    nextStep?: string;
  };
  runtimeState?: string;
  requestId?: string;
  reason?: string;
  nextStep?: string;
  missingPermissions?: string[];
  conversation?: {
    messages: Array<{
      role: "user" | "agent" | "system";
      content: string;
      metadata: Record<string, unknown>;
    }>;
  };
};

type ActivityResponse = {
  logs: Array<{
    actionType: string;
    status: string;
    dataAccessed?: string | null;
    dynamicMetadata: Record<string, unknown>;
    display: {
      title: string;
      summary: string;
      badge: string;
      category: string;
      nextStep?: string;
      privateInfoUsed: string[];
      approvalStatus?: string;
    };
  }>;
};

async function closeServer() {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function api<T>(path: string, userId: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      ...(options.headers ?? {})
    }
  });
  const body = await response.json() as T;
  return { response, body };
}

async function createUserAndAgent(input: {
  suffix: string;
  tools: string[];
  requestedSchemas?: string[];
  highRiskActions?: string[];
}) {
  const user = await prisma.user.create({
    data: {
      id: `${testRunId}-${input.suffix}`,
      email: `${testRunId}-${input.suffix}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
  const agent = await prisma.agent.create({
    data: {
      name: `${testRunId}-${input.suffix}-agent`,
      category: "Custom",
      apiProtocol: "MCP",
      trustScore: 82,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: input.tools,
        requestedSchemas: input.requestedSchemas ?? [],
        highRiskActions: input.highRiskActions ?? [],
        description: "Runtime API integration test agent."
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

async function createSchemaAndDocument(userId: string, schemaName: string) {
  const schema = await prisma.vaultSchema.upsert({
    where: { name: schemaName },
    create: {
      name: schemaName,
      description: "Runtime integration private info schema.",
      structuralTemplate: "{}"
    },
    update: {}
  });
  const text = "Passport name and travel preference notes for Lisbon hotels.";
  const embedding = await embedText(text);
  await prisma.vaultDocument.create({
    data: {
      userId,
      vaultSchemaId: schema.id,
      title: "Travel preferences",
      relativePath: `${testRunId}/${userId}/travel-preferences.md`,
      contentHash: sha256(text),
      frontmatter: encodeJson({ schema: schema.name }),
      excerpt: text,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    }
  });
  return schema;
}

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected test server port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await closeServer();
  await prisma.notification.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentRunStep.deleteMany({ where: { agentRun: { userId: { startsWith: testRunId } } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentMessage.deleteMany({ where: { conversation: { userId: { startsWith: testRunId } } } });
  await prisma.agentConversation.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.activityLog.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentPermission.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultDocument.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("agent run route blocks private-info search until access is granted, then supports revoke and re-allow", async () => {
  const { user, agent } = await createUserAndAgent({
    suffix: "permission-roundtrip",
    tools: ["vault.search"],
    requestedSchemas: ["Runtime Travel Preferences"]
  });
  const schema = await createSchemaAndDocument(user.id, "Runtime Travel Preferences");

  const blocked = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Summarize my travel preferences" })
  });
  assert.equal(blocked.response.status, 200);
  assert.equal(blocked.body.status, "blocked");
  assert.equal(blocked.body.runtimeState, "needs_permission");
  assert.match(blocked.body.reply, /needs permission/i);
  assert.equal(blocked.body.display?.title, "Access needed");
  assert.equal(blocked.body.display?.badge, "Needs access");
  assert.equal(blocked.body.display?.category, "permission");
  assert.doesNotMatch(JSON.stringify(blocked.body.display), /missing_private_info_permission|internal server error|provider_error/i);
  assert.deepEqual(blocked.body.missingPermissions, ["Runtime Travel Preferences"]);
  const blockedAgentMessage = blocked.body.conversation?.messages.find((message) => message.role === "agent");
  const blockedDisplay = blockedAgentMessage?.metadata.display as { title?: string; body?: string; badge?: string; category?: string; nextStep?: string } | undefined;
  assert.equal(blockedDisplay?.title, "Access needed");
  assert.equal(blockedDisplay?.badge, "Needs access");
  assert.equal(blockedDisplay?.category, "permission");
  assert.match(blockedDisplay?.nextStep ?? "", /Review.*allow|Review access/i);

  const grant = await api<{ permission: { id: string } }>(`/api/permissions/clearance`, user.id, {
    method: "POST",
    body: JSON.stringify({
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled: true,
      restrictionRules: {}
    })
  });
  assert.equal(grant.response.status, 200);
  assert.ok(grant.body.permission.id);

  const allowed = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Summarize my travel preferences" })
  });
  assert.equal(allowed.body.status, "ok");
  assert.equal(allowed.body.runtimeState, "ready");
  assert.doesNotMatch(allowed.body.reply, /internal server error|provider_error/i);

  const revoke = await api<{ permission: null }>(`/api/permissions/clearance`, user.id, {
    method: "POST",
    body: JSON.stringify({
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled: false,
      restrictionRules: {}
    })
  });
  assert.equal(revoke.response.status, 200);
  assert.equal(revoke.body.permission, null);

  const blockedAgain = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Search personal info again" })
  });
  assert.equal(blockedAgain.body.status, "blocked");
  assert.equal(blockedAgain.body.runtimeState, "needs_permission");

  const regrant = await api<{ permission: { id: string } }>(`/api/permissions/clearance`, user.id, {
    method: "POST",
    body: JSON.stringify({
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled: true,
      restrictionRules: {}
    })
  });
  assert.equal(regrant.response.status, 200);

  const allowedAgain = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Search personal info again" })
  });
  assert.equal(allowedAgain.body.status, "ok");
  assert.equal(allowedAgain.body.runtimeState, "ready");

  const activity = await api<ActivityResponse>("/api/activity", user.id);
  const permissionAllowed = activity.body.logs.find((log) =>
    log.actionType === "permission_requested" && log.display.title === "Private info access allowed"
  );
  const permissionRemoved = activity.body.logs.find((log) =>
    log.actionType === "permission_requested" && log.display.title === "Private info access removed"
  );
  const privateInfoRead = activity.body.logs.find((log) =>
    log.actionType === "vault_read" && log.status === "success"
  );
  const privateInfoBlocked = activity.body.logs.find((log) =>
    log.actionType === "vault_read" && log.status === "blocked_by_policy"
  );

  assert.equal(permissionAllowed?.display.category, "private_info");
  assert.equal(permissionAllowed?.display.badge, "Allowed");
  assert.deepEqual(permissionAllowed?.display.privateInfoUsed, ["Runtime Travel Preferences"]);
  assert.equal(permissionRemoved?.display.badge, "Removed");
  assert.deepEqual(permissionRemoved?.display.privateInfoUsed, ["Runtime Travel Preferences"]);
  assert.match(privateInfoRead?.display.summary ?? "", /private info/i);
  assert.match(privateInfoBlocked?.display.nextStep ?? "", /Review access|Review and allow/i);
});

test("approval flow creates a waiting request, allows once, resumes once, and keeps replies B2C-readable", async () => {
  const { user, agent } = await createUserAndAgent({
    suffix: "approval-roundtrip",
    tools: ["action.execute"],
    highRiskActions: ["book_non_refundable_travel"]
  });

  const first = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Book a hotel for my trip" })
  });
  assert.equal(first.body.status, "awaiting_human_approval");
  assert.equal(first.body.runtimeState, "needs_approval");
  assert.ok(first.body.requestId);
  assert.match(first.body.reply, /paused/i);
  assert.equal(first.body.display?.title, "Waiting for your approval");
  assert.equal(first.body.display?.badge, "Waiting for you");
  assert.equal(first.body.display?.category, "approval");
  assert.match(first.body.display?.body ?? "", /book non-refundable travel/i);
  assert.doesNotMatch(JSON.stringify(first.body.display), /book_non_refundable_travel|internal server error|provider_error/i);
  const waitingAgentMessage = first.body.conversation?.messages.find((message) => message.role === "agent");
  const waitingDisplay = waitingAgentMessage?.metadata.display as { title?: string; body?: string; badge?: string; category?: string; nextStep?: string } | undefined;
  assert.equal(waitingDisplay?.title, "Waiting for your approval");
  assert.equal(waitingDisplay?.badge, "Waiting for you");
  assert.equal(waitingDisplay?.category, "approval");
  assert.match(waitingDisplay?.body ?? "", /book non-refundable travel/i);
  assert.doesNotMatch(JSON.stringify(waitingDisplay), /book_non_refundable_travel|internal server error|provider_error/i);

  const request = await prisma.hitlRequest.findUniqueOrThrow({ where: { id: first.body.requestId } });
  assert.equal(request.status, "pending_human_approval");
  assert.equal(request.actionName, "book_non_refundable_travel");

  const decision = await api<{ request: { status: string } }>(`/api/hitl/${request.id}/decision`, user.id, {
    method: "POST",
    body: JSON.stringify({ approved: true })
  });
  assert.equal(decision.response.status, 200);
  assert.equal(decision.body.request.status, "success");

  const resumed = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Continue approved action: book non-refundable travel" })
  });
  assert.equal(resumed.body.status, "ok");
  assert.equal(resumed.body.runtimeState, "ready");
  assert.equal(resumed.body.display?.title, "Action completed");
  assert.equal(resumed.body.display?.badge, "Done");
  assert.match(resumed.body.reply, /book non-refundable travel/i);
  assert.doesNotMatch(JSON.stringify(resumed.body.display), /book_non_refundable_travel|provider_error|internal server error/i);
  assert.doesNotMatch(resumed.body.reply, /book_non_refundable_travel|provider_error|internal server error/i);
  const resumedDisplays = resumed.body.conversation?.messages
    .map((message) => message.metadata.display)
    .filter(Boolean) ?? [];
  assert.ok(resumedDisplays.length >= 2);
  assert.doesNotMatch(JSON.stringify(resumedDisplays), /book_non_refundable_travel|internal server error|provider_error/i);
  assert.match(JSON.stringify(resumedDisplays), /Action completed|Continue approved action/i);

  const reused = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Continue approved action: book non-refundable travel" })
  });
  assert.equal(reused.body.status, "blocked");
  assert.match(reused.body.reply, /could not find an approved action/i);
  assert.match(reused.body.nextStep ?? "", /Approve the paused action/i);

  const activity = await api<ActivityResponse>("/api/activity", user.id);
  const requested = activity.body.logs.find((log) => log.actionType === "hitl_requested");
  const approved = activity.body.logs.find((log) => log.actionType === "hitl_approved");
  const completed = activity.body.logs.find((log) =>
    log.actionType === "execution_triggered" && /completed/i.test(log.display.title)
  );
  assert.match(requested?.display.title ?? "", /paused before book non-refundable travel/i);
  assert.equal(requested?.display.approvalStatus, "waiting");
  assert.equal(requested?.display.nextStep, "Allow once or deny.");
  assert.equal(approved?.display.title, "You allowed this once");
  assert.equal(approved?.display.approvalStatus, "allowed");
  assert.doesNotMatch(completed?.display.title ?? "", /book_non_refundable_travel/);
  assert.match(completed?.display.title ?? "", /book non-refundable travel/i);
});

test("removed agent cannot keep running through the runtime route", async () => {
  const { user, agent } = await createUserAndAgent({
    suffix: "removed-agent",
    tools: ["vault.search"]
  });

  const removed = await api<{ status: string; deletedAgent: boolean }>(`/api/agents/${agent.id}`, user.id, {
    method: "DELETE"
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.status, "removed");

  const run = await api<RuntimeResponse>(`/api/me/agents/${agent.id}/run`, user.id, {
    method: "POST",
    body: JSON.stringify({ message: "Can you still run?" })
  });
  assert.equal(run.response.status, 200);
  assert.equal(run.body.status, "blocked");
  assert.match(run.body.reply, /not connected to your profile/i);

  const activity = await api<ActivityResponse>("/api/activity", user.id);
  const removedLog = activity.body.logs.find((log) => log.actionType === "agent_removed");
  assert.equal(removedLog?.display.title, "Agent removed");
  assert.match(removedLog?.display.summary ?? "", /removed from your profile/i);
});
