import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");

const testRunId = `creator-${Date.now()}`;
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
  await prisma.userAgentInstall.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.agentVersion.deleteMany({ where: { agentDefinition: { slug: { startsWith: testRunId } } } });
  await prisma.agentDefinition.deleteMany({ where: { slug: { startsWith: testRunId } } });
  await prisma.creatorProfile.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.creatorAccessRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultSchema.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

async function createUser(suffix: string, role: "user" | "creator" | "moderator" | "admin" = "creator") {
  const id = `${testRunId}-${suffix}`;
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      role,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}

async function createSchema(suffix: string) {
  return prisma.vaultSchema.create({
    data: {
      name: `${testRunId} ${suffix}`,
      description: "Creator test private info category.",
      structuralTemplate: encodeJson({ fields: ["note"] })
    }
  });
}

function draftBody(input: { name: string; schemaName?: string; promptNeedle?: string }) {
  return {
    name: `${testRunId} ${input.name}`,
    tagline: "Helps with a clearly scoped creator workflow.",
    description: "A creator-published helper used to verify marketplace publishing behavior.",
    category: "Executive",
    apiProtocol: "MCP",
    capabilityManifest: {
      protocol: "MCP",
      tools: ["vault.search", "email.draft"],
      requestedSchemas: input.schemaName ? [input.schemaName] : [],
      highRiskActions: ["send_email"],
      description: "A creator helper that drafts useful outputs while keeping risky actions approval-gated.",
      examplePrompts: [`Help me with ${input.promptNeedle ?? input.name} safely`],
      trustReasons: ["Drafts first and asks before sending anything"]
    }
  };
}

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "x-user-id": userId } });
}

async function apiSend(method: "POST" | "PUT", path: string, userId: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body)
  });
}

test("creator profile can be created and updated without user-controlled verification", async () => {
  const user = await createUser("profile-user");

  const emptyResponse = await apiGet("/api/creator/profile", user.id);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), { profile: null });

  const createResponse = await apiSend("PUT", "/api/creator/profile", user.id, {
    displayName: "Helpful Maker",
    bio: "I publish practical helpers.",
    verified: true
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { profile: { displayName: string; bio: string; verified: boolean } };
  assert.equal(created.profile.displayName, "Helpful Maker");
  assert.equal(created.profile.bio, "I publish practical helpers.");
  assert.equal(created.profile.verified, false);

  const updateResponse = await apiSend("PUT", "/api/creator/profile", user.id, {
    displayName: "Better Maker",
    bio: ""
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json() as { profile: { displayName: string; bio: string; verified: boolean } };
  assert.equal(updated.profile.displayName, "Better Maker");
  assert.equal(updated.profile.bio, "");
  assert.equal(updated.profile.verified, false);
});

test("current user capabilities expose marketplace moderation access by role", async () => {
  const normalUser = await createUser("capability-user", "user");
  const creator = await createUser("capability-creator", "creator");
  const moderator = await createUser("capability-moderator", "moderator");
  const admin = await createUser("capability-admin", "admin");
  const privilegedLookingUser = await createUser("admin-looking-user", "user");

  const normalResponse = await apiGet("/api/me", normalUser.id);
  assert.equal(normalResponse.status, 200);
  const normal = await normalResponse.json() as { user: { role: string }; capabilities: { canCreateMarketplaceAgents: boolean; canModerateMarketplace: boolean } };
  assert.equal(normal.user.role, "user");
  assert.equal(normal.capabilities.canCreateMarketplaceAgents, false);
  assert.equal(normal.capabilities.canModerateMarketplace, false);

  const creatorResponse = await apiGet("/api/me", creator.id);
  assert.equal(creatorResponse.status, 200);
  const creatorBody = await creatorResponse.json() as { user: { role: string }; capabilities: { canCreateMarketplaceAgents: boolean; canModerateMarketplace: boolean } };
  assert.equal(creatorBody.user.role, "creator");
  assert.equal(creatorBody.capabilities.canCreateMarketplaceAgents, true);
  assert.equal(creatorBody.capabilities.canModerateMarketplace, false);

  const moderatorResponse = await apiGet("/api/me", moderator.id);
  assert.equal(moderatorResponse.status, 200);
  const moderatorBody = await moderatorResponse.json() as { user: { role: string }; capabilities: { canCreateMarketplaceAgents: boolean; canModerateMarketplace: boolean } };
  assert.equal(moderatorBody.user.role, "moderator");
  assert.equal(moderatorBody.capabilities.canCreateMarketplaceAgents, true);
  assert.equal(moderatorBody.capabilities.canModerateMarketplace, true);

  const adminResponse = await apiGet("/api/me", admin.id);
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.json() as { user: { role: string }; capabilities: { canCreateMarketplaceAgents: boolean; canModerateMarketplace: boolean } };
  assert.equal(adminBody.user.role, "admin");
  assert.equal(adminBody.capabilities.canCreateMarketplaceAgents, true);
  assert.equal(adminBody.capabilities.canModerateMarketplace, true);

  const privilegedLookingResponse = await apiGet("/api/me", privilegedLookingUser.id);
  assert.equal(privilegedLookingResponse.status, 200);
  const privilegedLooking = await privilegedLookingResponse.json() as { capabilities: { canCreateMarketplaceAgents: boolean; canModerateMarketplace: boolean } };
  assert.equal(privilegedLooking.capabilities.canCreateMarketplaceAgents, false);
  assert.equal(privilegedLooking.capabilities.canModerateMarketplace, false);
});

test("normal consumers cannot call creator or external import APIs directly", async () => {
  const consumer = await createUser("consumer-capability-blocked", "user");

  const profileResponse = await apiGet("/api/creator/profile", consumer.id);
  assert.equal(profileResponse.status, 403);
  const profileBody = await profileResponse.json() as { error: { code: string } };
  assert.equal(profileBody.error.code, "creator_capability_required");

  const saveProfileResponse = await apiSend("PUT", "/api/creator/profile", consumer.id, { displayName: "Blocked Creator" });
  assert.equal(saveProfileResponse.status, 403);

  const createDraftResponse = await apiSend("POST", "/api/creator/agents", consumer.id, draftBody({ name: "Blocked Draft" }));
  assert.equal(createDraftResponse.status, 403);
  const createDraftBody = await createDraftResponse.json() as { error: { code: string } };
  assert.equal(createDraftBody.error.code, "creator_capability_required");

  const previewImportResponse = await apiSend("POST", "/api/external-agents/preview", consumer.id, {
    name: "Blocked External Helper",
    endpointUrl: "https://agents.example.test/helper/mcp",
    sourceType: "mcp_server"
  });
  assert.equal(previewImportResponse.status, 403);
  const previewImportBody = await previewImportResponse.json() as { error: { code: string } };
  assert.equal(previewImportBody.error.code, "external_import_capability_required");

  const importResponse = await apiSend("POST", "/api/external-agents/import", consumer.id, {
    name: "Blocked External Helper",
    endpointUrl: "https://agents.example.test/helper/mcp",
    sourceType: "mcp_server"
  });
  assert.equal(importResponse.status, 403);
});

test("normal users can request creator access and moderators can approve it", async () => {
  const user = await createUser("creator-access-requester", "user");
  const moderator = await createUser("creator-access-approver", "moderator");
  const reason = "I want to publish travel planning helpers that ask before booking anything.";

  const initialAccessResponse = await apiGet("/api/creator-access/me", user.id);
  assert.equal(initialAccessResponse.status, 200);
  const initialAccess = await initialAccessResponse.json() as {
    canCreateMarketplaceAgents: boolean;
    request: null;
  };
  assert.equal(initialAccess.canCreateMarketplaceAgents, false);
  assert.equal(initialAccess.request, null);

  const requestResponse = await apiSend("POST", "/api/creator-access/request", user.id, { reason });
  assert.equal(requestResponse.status, 201);
  const requested = await requestResponse.json() as { request: { id: string; status: string; reason: string; userEmail: string } };
  assert.equal(requested.request.status, "pending");
  assert.equal(requested.request.reason, reason);
  assert.match(requested.request.userEmail, /creator-access-requester@local\.test$/);

  const duplicateResponse = await apiSend("POST", "/api/creator-access/request", user.id, { reason });
  assert.equal(duplicateResponse.status, 409);
  const duplicate = await duplicateResponse.json() as { error: { code: string } };
  assert.equal(duplicate.error.code, "creator_access_request_pending");

  const forbiddenListResponse = await apiGet("/api/creator-access/requests", user.id);
  assert.equal(forbiddenListResponse.status, 403);

  const queueResponse = await apiGet("/api/creator-access/requests", moderator.id);
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json() as { requests: Array<{ id: string; status: string; userId: string }> };
  assert(queue.requests.some((item) => item.id === requested.request.id && item.userId === user.id));

  const approveResponse = await apiSend("POST", `/api/creator-access/requests/${requested.request.id}/approve`, moderator.id);
  assert.equal(approveResponse.status, 200);
  const approved = await approveResponse.json() as { request: { status: string; reviewedByUserId: string } };
  assert.equal(approved.request.status, "approved");
  assert.equal(approved.request.reviewedByUserId, moderator.id);

  const currentUserResponse = await apiGet("/api/me", user.id);
  assert.equal(currentUserResponse.status, 200);
  const currentUserBody = await currentUserResponse.json() as {
    user: { role: string };
    capabilities: { canCreateMarketplaceAgents: boolean };
  };
  assert.equal(currentUserBody.user.role, "creator");
  assert.equal(currentUserBody.capabilities.canCreateMarketplaceAgents, true);
});

test("creator access requests can be denied with reviewer feedback", async () => {
  const user = await createUser("creator-access-denied", "user");
  const moderator = await createUser("creator-access-denier", "moderator");
  const reason = "I want to publish useful agents for daily planning.";
  const note = "Please explain the helper category and user safety controls more clearly.";

  const requestResponse = await apiSend("POST", "/api/creator-access/request", user.id, { reason });
  assert.equal(requestResponse.status, 201);
  const requested = await requestResponse.json() as { request: { id: string } };

  const forbiddenDenyResponse = await apiSend("POST", `/api/creator-access/requests/${requested.request.id}/deny`, user.id, { note });
  assert.equal(forbiddenDenyResponse.status, 403);

  const denyResponse = await apiSend("POST", `/api/creator-access/requests/${requested.request.id}/deny`, moderator.id, { note });
  assert.equal(denyResponse.status, 200);
  const denied = await denyResponse.json() as { request: { status: string; reviewNote: string; reviewedByUserId: string } };
  assert.equal(denied.request.status, "denied");
  assert.equal(denied.request.reviewNote, note);
  assert.equal(denied.request.reviewedByUserId, moderator.id);

  const accessResponse = await apiGet("/api/creator-access/me", user.id);
  assert.equal(accessResponse.status, 200);
  const access = await accessResponse.json() as {
    canCreateMarketplaceAgents: boolean;
    request: { status: string; reviewNote: string };
  };
  assert.equal(access.canCreateMarketplaceAgents, false);
  assert.equal(access.request.status, "denied");
  assert.equal(access.request.reviewNote, note);
});

test("creator-enabled users cannot request creator access again", async () => {
  const creator = await createUser("creator-access-already-enabled", "creator");

  const response = await apiSend("POST", "/api/creator-access/request", creator.id, {
    reason: "I already have creator tools and should not need another request."
  });
  assert.equal(response.status, 409);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "creator_access_already_enabled");
});

test("creator can create draft helpers with unique slugs and list only their own agents", async () => {
  const firstUser = await createUser("draft-owner-a");
  const secondUser = await createUser("draft-owner-b");
  const schema = await createSchema("Career Profile");

  const firstResponse = await apiSend("POST", "/api/creator/agents", firstUser.id, draftBody({
    name: "Application Coach",
    schemaName: schema.name
  }));
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as { agent: { id: string; slug: string; status: string; versions: Array<{ isActive: boolean }> } };
  assert.equal(first.agent.status, "draft");
  assert.equal(first.agent.versions[0]?.isActive, false);

  const secondResponse = await apiSend("POST", "/api/creator/agents", secondUser.id, draftBody({
    name: "Application Coach",
    schemaName: schema.name
  }));
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json() as { agent: { id: string; slug: string } };
  assert.notEqual(second.agent.slug, first.agent.slug);

  const listResponse = await apiGet("/api/creator/agents", firstUser.id);
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as { agents: Array<{ id: string }> };
  assert.deepEqual(list.agents.map((agent) => agent.id), [first.agent.id]);
});

test("creator draft validation rejects invalid manifests and unknown requested schemas", async () => {
  const user = await createUser("validation-user");

  const invalidManifestResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Invalid Manifest" }),
    capabilityManifest: {
      protocol: "MCP",
      tools: [],
      requestedSchemas: [],
      highRiskActions: [],
      description: "too short",
      examplePrompts: [],
      trustReasons: []
    }
  });
  assert.equal(invalidManifestResponse.status, 400);

  const unknownSchemaResponse = await apiSend("POST", "/api/creator/agents", user.id, draftBody({
    name: "Unknown Schema",
    schemaName: `${testRunId} Missing Schema`
  }));
  assert.equal(unknownSchemaResponse.status, 400);
  const unknownSchema = await unknownSchemaResponse.json() as { error: { code: string; message: string } };
  assert.equal(unknownSchema.error.code, "unknown_requested_schema");
  assert.match(unknownSchema.error.message, /unknown private info category/i);
});

test("creator ownership is enforced for updates", async () => {
  const owner = await createUser("owned-helper-user");
  const outsider = await createUser("outsider-user");
  const response = await apiSend("POST", "/api/creator/agents", owner.id, draftBody({ name: "Owned Draft" }));
  const data = await response.json() as { agent: { id: string } };

  const updateResponse = await apiSend("PUT", `/api/creator/agents/${data.agent.id}`, outsider.id, {
    tagline: "Trying to edit someone else's helper."
  });
  assert.equal(updateResponse.status, 404);
});

test("publishing makes a draft visible in marketplace and archive hides it without deleting installs", async () => {
  const creator = await createUser("publisher");
  const consumer = await createUser("consumer");
  const promptNeedle = `${testRunId}-publish-visible`;
  const draftResponse = await apiSend("POST", "/api/creator/agents", creator.id, draftBody({
    name: "Publishable Helper",
    promptNeedle
  }));
  assert.equal(draftResponse.status, 201);
  const draft = await draftResponse.json() as { agent: { id: string } };

  const hiddenResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(hiddenResponse.status, 200);
  const hidden = await hiddenResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(hidden.agents.some((agent) => agent.id === draft.agent.id), false);

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);
  const published = await publishResponse.json() as {
    agent: { id: string; status: string; versions: Array<{ isActive: boolean }> };
    readiness: { outcome: string; code: string; items: Array<{ key: string; passed: boolean }> };
  };
  assert.equal(published.agent.status, "published");
  assert.equal(published.agent.versions[0]?.isActive, true);
  assert.equal(published.readiness.outcome, "publish");
  assert.equal(published.readiness.code, "creator_listing_ready");
  assert.ok(published.readiness.items.some((item) => item.key === "example_prompts" && item.passed));

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(visibleResponse.status, 200);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(visible.agents.some((agent) => agent.id === draft.agent.id), true);

  const installResponse = await apiSend("POST", `/api/marketplace/agents/${draft.agent.id}/install`, consumer.id);
  assert.equal(installResponse.status, 201);
  assert.equal(await prisma.userAgentInstall.count({ where: { userId: consumer.id, agentDefinitionId: draft.agent.id } }), 1);

  const archiveResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/archive`, creator.id);
  assert.equal(archiveResponse.status, 200);
  const archived = await archiveResponse.json() as { agent: { status: string } };
  assert.equal(archived.agent.status, "archived");

  const archivedMarketplaceResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(archivedMarketplaceResponse.status, 200);
  const archivedMarketplace = await archivedMarketplaceResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(archivedMarketplace.agents.some((agent) => agent.id === draft.agent.id), false);
  assert.equal(await prisma.userAgentInstall.count({ where: { userId: consumer.id, agentDefinitionId: draft.agent.id } }), 1);
});

test("publishing blocks test-like helper names", async () => {
  const user = await createUser("test-like-publisher");
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Demo Helper" }),
    name: `${testRunId} Demo Helper`
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string; status: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 400);
  const body = await publishResponse.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "creator_listing_test_content");
  assert.match(body.error.message, /real helper name/i);

  const stored = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: draft.agent.id }, select: { status: true } });
  assert.equal(stored.status, "draft");
});

test("publishing sends vague helper listings to review and keeps them out of marketplace", async () => {
  const user = await createUser("vague-publisher");
  const consumer = await createUser("vague-consumer");
  const promptNeedle = `${testRunId}-vague-review`;
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Universal Helper", promptNeedle }),
    tagline: "Assistant for anything",
    description: "This AI agent helps with tasks and does everything for people.",
    capabilityManifest: {
      ...draftBody({ name: "Universal Helper", promptNeedle }).capabilityManifest,
      description: "This AI agent helps with tasks and does everything for people.",
      examplePrompts: [`Help me with ${promptNeedle} safely`]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const readinessResponse = await apiGet(`/api/creator/agents/${draft.agent.id}/readiness`, user.id);
  assert.equal(readinessResponse.status, 200);
  const readinessPreview = await readinessResponse.json() as {
    readiness: { outcome: string; items: Array<{ key: string; passed: boolean; guidance: string }> };
  };
  assert.equal(readinessPreview.readiness.outcome, "needs_review");
  assert.ok(readinessPreview.readiness.items.some((item) => item.key === "description" && !item.passed && item.guidance.length > 10));

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 200);
  const body = await publishResponse.json() as {
    agent: { status: string; versions: Array<{ isActive: boolean }> };
    readiness: { outcome: string; code: string; message: string; items: Array<{ key: string; passed: boolean }> };
  };
  assert.equal(body.agent.status, "needs_review");
  assert.equal(body.agent.versions[0]?.isActive, false);
  assert.equal(body.readiness.outcome, "needs_review");
  assert.equal(body.readiness.code, "creator_listing_too_vague");
  assert.match(body.readiness.message, /needs review/i);

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(visibleResponse.status, 200);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(visible.agents.some((agent) => agent.id === draft.agent.id), false);

  const installResponse = await apiSend("POST", `/api/marketplace/agents/${draft.agent.id}/install`, consumer.id);
  assert.equal(installResponse.status, 404);
});

test("publishing sends weak trust notes to review", async () => {
  const user = await createUser("missing-trust-publisher");
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Report Writer" }),
    capabilityManifest: {
      ...draftBody({ name: "Report Writer" }).capabilityManifest,
      highRiskActions: [],
      trustReasons: ["Built with careful workflow details"]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 200);
  const body = await publishResponse.json() as { agent: { status: string; versions: Array<{ isActive: boolean }> } };
  assert.equal(body.agent.status, "needs_review");
  assert.equal(body.agent.versions[0]?.isActive, false);
});

test("editing a review helper returns it to draft for resubmission", async () => {
  const user = await createUser("review-edit-publisher");
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Review Edit Helper" }),
    description: "This helper plans trips with people."
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 200);
  const review = await publishResponse.json() as { agent: { status: string } };
  assert.equal(review.agent.status, "needs_review");

  const updateResponse = await apiSend("PUT", `/api/creator/agents/${draft.agent.id}`, user.id, {
    tagline: "Gives families a clear weekend planning checklist before booking.",
    description: "This helper compares travel ideas, summarizes tradeoffs, and asks for approval before booking or sharing private details."
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json() as { agent: { status: string; tagline: string } };
  assert.equal(updated.agent.status, "draft");
  assert.match(updated.agent.tagline, /weekend planning/i);
});

test("moderator can approve review helpers into the marketplace", async () => {
  const creator = await createUser("moderated-creator");
  const moderator = await createUser("queue-moderator", "moderator");
  const consumer = await createUser("moderated-consumer");
  const promptNeedle = `${testRunId}-moderation-approve`;
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "Approve Review Helper", promptNeedle }),
    description: "This helper gives general help with tasks for people.",
    capabilityManifest: {
      ...draftBody({ name: "Approve Review Helper", promptNeedle }).capabilityManifest,
      highRiskActions: [],
      description: "This helper gives general help with tasks for people.",
      examplePrompts: [`Help me with ${promptNeedle} safely`],
      trustReasons: ["Built with careful workflow details"]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);
  const review = await publishResponse.json() as { agent: { status: string; moderationNote: string } };
  assert.equal(review.agent.status, "needs_review");
  assert.match(review.agent.moderationNote, /review/i);

  const forbiddenListResponse = await apiGet("/api/moderation/creator-agents", creator.id);
  assert.equal(forbiddenListResponse.status, 403);

  const queueResponse = await apiGet("/api/moderation/creator-agents", moderator.id);
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json() as { agents: Array<{ id: string; status: string }> };
  assert(queue.agents.some((agent) => agent.id === draft.agent.id && agent.status === "needs_review"));

  const approveResponse = await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/approve`, moderator.id);
  assert.equal(approveResponse.status, 200);
  const approved = await approveResponse.json() as { agent: { status: string; versions: Array<{ isActive: boolean }>; reviewedByUserId: string; moderationNote: string } };
  assert.equal(approved.agent.status, "published");
  assert.equal(approved.agent.versions[0]?.isActive, true);
  assert.equal(approved.agent.reviewedByUserId, moderator.id);
  assert.equal(approved.agent.moderationNote, "");

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(visibleResponse.status, 200);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(visible.agents.some((agent) => agent.id === draft.agent.id), true);

  const installResponse = await apiSend("POST", `/api/marketplace/agents/${draft.agent.id}/install`, consumer.id);
  assert.equal(installResponse.status, 201);
});

test("moderator can send review helpers back to draft with feedback", async () => {
  const creator = await createUser("sendback-creator");
  const moderator = await createUser("sendback-moderator", "moderator");
  const consumer = await createUser("sendback-consumer");
  const promptNeedle = `${testRunId}-moderation-sendback`;
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "Send Back Review Helper", promptNeedle }),
    description: "This helper gives general help with tasks for people.",
    capabilityManifest: {
      ...draftBody({ name: "Send Back Review Helper", promptNeedle }).capabilityManifest,
      highRiskActions: [],
      description: "This helper gives general help with tasks for people.",
      examplePrompts: [`Help me with ${promptNeedle} safely`],
      trustReasons: ["Built with careful workflow details"]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);

  const note = "Please explain what access this helper needs before asking people for private info.";
  const sendBackResponse = await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/send-back`, moderator.id, { note });
  assert.equal(sendBackResponse.status, 200);
  const sentBack = await sendBackResponse.json() as { agent: { status: string; moderationNote: string; versions: Array<{ isActive: boolean }> } };
  assert.equal(sentBack.agent.status, "draft");
  assert.equal(sentBack.agent.moderationNote, note);
  assert.equal(sentBack.agent.versions[0]?.isActive, false);

  const creatorListResponse = await apiGet("/api/creator/agents", creator.id);
  assert.equal(creatorListResponse.status, 200);
  const creatorList = await creatorListResponse.json() as { agents: Array<{ id: string; status: string; moderationNote: string }> };
  const returned = creatorList.agents.find((agent) => agent.id === draft.agent.id);
  assert.equal(returned?.status, "draft");
  assert.equal(returned?.moderationNote, note);

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(visibleResponse.status, 200);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(visible.agents.some((agent) => agent.id === draft.agent.id), false);
});

test("creator can fix and publish a sent-back draft while clearing review feedback", async () => {
  const creator = await createUser("resubmit-strong-creator");
  const moderator = await createUser("resubmit-strong-moderator", "moderator");
  const consumer = await createUser("resubmit-strong-consumer");
  const promptNeedle = `${testRunId}-resubmit-strong`;
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "Resubmit Strong Helper", promptNeedle }),
    description: "This helper gives general help with tasks for people.",
    capabilityManifest: {
      ...draftBody({ name: "Resubmit Strong Helper", promptNeedle }).capabilityManifest,
      highRiskActions: [],
      description: "This helper gives general help with tasks for people.",
      examplePrompts: [`Help me with ${promptNeedle} safely`],
      trustReasons: ["Built with careful workflow details"]
    }
  });
  const draft = await createResponse.json() as { agent: { id: string } };
  await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);

  const note = "Please explain when this helper asks before using private info.";
  const sendBackResponse = await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/send-back`, moderator.id, { note });
  assert.equal(sendBackResponse.status, 200);

  const updateResponse = await apiSend("PUT", `/api/creator/agents/${draft.agent.id}`, creator.id, {
    tagline: "Plans focused weekly tasks and explains what it needs first.",
    description: "This helper organizes weekly tasks, compares options, and explains any requested private info before using it.",
    capabilityManifest: {
      ...draftBody({ name: "Resubmit Strong Helper", promptNeedle }).capabilityManifest,
      highRiskActions: [],
      description: "This helper organizes weekly tasks, compares options, and explains any requested private info before using it.",
      examplePrompts: [`Help me with ${promptNeedle} safely`],
      trustReasons: ["Explains what private info it needs before asking for permission"]
    }
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json() as { agent: { status: string; moderationNote: string } };
  assert.equal(updated.agent.status, "draft");
  assert.equal(updated.agent.moderationNote, note);

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);
  const published = await publishResponse.json() as { agent: { status: string; moderationNote: string; versions: Array<{ isActive: boolean }> } };
  assert.equal(published.agent.status, "published");
  assert.equal(published.agent.moderationNote, "");
  assert.equal(published.agent.versions[0]?.isActive, true);

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.equal(visible.agents.some((agent) => agent.id === draft.agent.id), true);
});

test("resubmitting a still-borderline sent-back draft returns it to review with a fresh reason", async () => {
  const creator = await createUser("resubmit-weak-creator");
  const moderator = await createUser("resubmit-weak-moderator", "moderator");
  const promptNeedle = `${testRunId}-resubmit-weak`;
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "Resubmit Weak Helper", promptNeedle }),
    description: "This helper gives general help with tasks for people.",
    capabilityManifest: {
      ...draftBody({ name: "Resubmit Weak Helper", promptNeedle }).capabilityManifest,
      highRiskActions: [],
      description: "This helper gives general help with tasks for people.",
      examplePrompts: [`Help me with ${promptNeedle} safely`],
      trustReasons: ["Built with careful workflow details"]
    }
  });
  const draft = await createResponse.json() as { agent: { id: string } };
  await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);

  const note = "Please make the benefit and trust language clearer.";
  await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/send-back`, moderator.id, { note });
  const storedBefore = await prisma.agentDefinition.findUniqueOrThrow({
    where: { id: draft.agent.id },
    select: { submittedForReviewAt: true }
  });

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);
  const reviewedAgain = await publishResponse.json() as { agent: { status: string; moderationNote: string; submittedForReviewAt: string | null; versions: Array<{ isActive: boolean }> } };
  assert.equal(reviewedAgain.agent.status, "needs_review");
  assert.notEqual(reviewedAgain.agent.moderationNote, note);
  assert.match(reviewedAgain.agent.moderationNote, /review|clear/i);
  assert.equal(reviewedAgain.agent.versions[0]?.isActive, false);
  assert(reviewedAgain.agent.submittedForReviewAt);
  assert.notEqual(new Date(reviewedAgain.agent.submittedForReviewAt).toISOString(), storedBefore.submittedForReviewAt?.toISOString());
});

test("hard-blocked resubmission keeps the creator-facing review note", async () => {
  const creator = await createUser("resubmit-hardblock-creator");
  const moderator = await createUser("resubmit-hardblock-moderator", "moderator");
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "Resubmit Hard Block Helper" }),
    description: "This helper gives general help with tasks for people.",
    capabilityManifest: {
      ...draftBody({ name: "Resubmit Hard Block Helper" }).capabilityManifest,
      highRiskActions: [],
      description: "This helper gives general help with tasks for people.",
      trustReasons: ["Built with careful workflow details"]
    }
  });
  const draft = await createResponse.json() as { agent: { id: string } };
  await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);

  const note = "Please replace placeholder language with a real helper listing.";
  await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/send-back`, moderator.id, { note });
  const updateResponse = await apiSend("PUT", `/api/creator/agents/${draft.agent.id}`, creator.id, {
    name: `${testRunId} Demo Helper`,
    tagline: "Demo helper for testing"
  });
  assert.equal(updateResponse.status, 200);

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 400);
  const stored = await prisma.agentDefinition.findUniqueOrThrow({
    where: { id: draft.agent.id },
    select: { status: true, moderationNote: true }
  });
  assert.equal(stored.status, "draft");
  assert.equal(stored.moderationNote, note);
});

test("moderation actions reject helpers outside review", async () => {
  const creator = await createUser("wrong-state-creator");
  const moderator = await createUser("wrong-state-moderator", "moderator");
  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, draftBody({ name: "Wrong State Helper" }));
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const approveResponse = await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/approve`, moderator.id);
  assert.equal(approveResponse.status, 409);
  const body = await approveResponse.json() as { error: { code: string } };
  assert.equal(body.error.code, "moderation_agent_not_in_review");
});

test("publishing risky-action helpers requires ask-before copy", async () => {
  const user = await createUser("risky-copy-publisher");
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, {
    ...draftBody({ name: "Travel Buyer" }),
    tagline: "Books useful travel plans for weekend trips.",
    description: "This helper compares flights, hotels, train routes, and itinerary options for travelers.",
    capabilityManifest: {
      ...draftBody({ name: "Travel Buyer" }).capabilityManifest,
      highRiskActions: ["book_travel"],
      trustReasons: ["Private access is limited to selected travel notes"]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 400);
  const body = await publishResponse.json() as { error: { code: string } };
  assert.equal(body.error.code, "creator_listing_risky_actions_need_approval_copy");
});

test("publishing allows strong listings with risky actions and approval copy", async () => {
  const user = await createUser("strong-publisher");
  const promptNeedle = `${testRunId}-strong-publish`;
  const createResponse = await apiSend("POST", "/api/creator/agents", user.id, draftBody({
    name: "Strong Travel Planner",
    promptNeedle
  }));
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as { agent: { id: string } };

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, user.id);
  assert.equal(publishResponse.status, 200);
  const body = await publishResponse.json() as { agent: { status: string }; readiness: { outcome: string } };
  assert.equal(body.agent.status, "published");
  assert.equal(body.readiness.outcome, "publish");
});

test("external helper imports require endpoint details and moderator verification before discovery", async () => {
  const creator = await createUser("external-import-creator");
  const moderator = await createUser("external-import-moderator", "moderator");
  const consumer = await createUser("external-import-consumer");
  const promptNeedle = `${testRunId}-external-import`;

  const invalidResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "External Missing Endpoint" }),
    capabilityManifest: {
      ...draftBody({ name: "External Missing Endpoint" }).capabilityManifest,
      sourceType: "mcp_server"
    }
  });
  assert.equal(invalidResponse.status, 400);

  const createResponse = await apiSend("POST", "/api/creator/agents", creator.id, {
    ...draftBody({ name: "External Trip Import", promptNeedle }),
    capabilityManifest: {
      ...draftBody({ name: "External Trip Import", promptNeedle }).capabilityManifest,
      sourceType: "mcp_server",
      externalEndpointUrl: "https://agents.example.test/trip-planner/mcp",
      verificationSummary: ["Creator declared this MCP endpoint for import review."]
    }
  });
  assert.equal(createResponse.status, 201);
  const draft = await createResponse.json() as {
    agent: {
      id: string;
      versions: Array<{ capabilityManifest: { sourceType?: string; externalEndpointUrl?: string } }>;
    };
  };
  assert.equal(draft.agent.versions[0]?.capabilityManifest.sourceType, "mcp_server");
  assert.equal(draft.agent.versions[0]?.capabilityManifest.externalEndpointUrl, "https://agents.example.test/trip-planner/mcp");

  const publishResponse = await apiSend("POST", `/api/creator/agents/${draft.agent.id}/publish`, creator.id);
  assert.equal(publishResponse.status, 200);
  const review = await publishResponse.json() as {
    agent: { status: string; moderationNote: string; versions: Array<{ isActive: boolean }> };
    readiness: { outcome: string; code: string; items: Array<{ key: string; passed: boolean }> };
  };
  assert.equal(review.agent.status, "needs_review");
  assert.match(review.agent.moderationNote, /External helpers need marketplace review/i);
  assert.equal(review.agent.versions[0]?.isActive, false);
  assert.equal(review.readiness.outcome, "needs_review");
  assert.equal(review.readiness.code, "creator_external_agent_needs_review");
  assert.ok(review.readiness.items.some((item) => item.key === "external_review" && !item.passed));

  const hiddenResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(hiddenResponse.status, 200);
  const hidden = await hiddenResponse.json() as { agents: Array<{ id: string }> };
  assert.ok(hidden.agents.every((agent) => agent.id !== draft.agent.id));

  const installBeforeApproval = await apiSend("POST", `/api/marketplace/agents/${draft.agent.id}/install`, consumer.id);
  assert.equal(installBeforeApproval.status, 404);

  const queueResponse = await apiGet("/api/moderation/creator-agents", moderator.id);
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json() as {
    agents: Array<{ id: string; versions: Array<{ capabilityManifest: { sourceType?: string; verificationStatus?: string } }> }>;
  };
  const queued = queue.agents.find((agent) => agent.id === draft.agent.id);
  assert.equal(queued?.versions[0]?.capabilityManifest.sourceType, "mcp_server");
  assert.equal(queued?.versions[0]?.capabilityManifest.verificationStatus, "declared");

  const approveResponse = await apiSend("POST", `/api/moderation/creator-agents/${draft.agent.id}/approve`, moderator.id);
  assert.equal(approveResponse.status, 200);
  const approved = await approveResponse.json() as {
    agent: {
      status: string;
      versions: Array<{ isActive: boolean; capabilityManifest: { verificationStatus?: string; verificationSummary?: string[] } }>;
    };
  };
  assert.equal(approved.agent.status, "published");
  assert.equal(approved.agent.versions[0]?.isActive, true);
  assert.equal(approved.agent.versions[0]?.capabilityManifest.verificationStatus, "verified");
  assert.ok(approved.agent.versions[0]?.capabilityManifest.verificationSummary?.some((note) => /moderator verified/i.test(note)));

  const visibleResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(promptNeedle)}`, consumer.id);
  assert.equal(visibleResponse.status, 200);
  const visible = await visibleResponse.json() as { agents: Array<{ id: string }> };
  assert.ok(visible.agents.some((agent) => agent.id === draft.agent.id));
});

test("publishing rejects helpers without a valid stored manifest", async () => {
  const user = await createUser("invalid-stored-manifest");
  const profile = await prisma.creatorProfile.create({
    data: { userId: user.id, displayName: "Invalid Publisher", bio: "" }
  });
  const definition = await prisma.agentDefinition.create({
    data: {
      creatorId: profile.id,
      slug: `${testRunId}-invalid-stored-manifest`,
      name: `${testRunId} Invalid Stored Manifest`,
      tagline: "Invalid stored manifest helper.",
      description: "This helper intentionally has invalid stored manifest data.",
      category: "Executive",
      status: "draft"
    }
  });
  await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: "1.0.0",
      apiProtocol: "MCP",
      capabilityManifest: encodeJson({ protocol: "MCP", tools: [] }),
      isActive: false
    }
  });

  const response = await apiSend("POST", `/api/creator/agents/${definition.id}/publish`, user.id);
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "invalid_capability_manifest");
});
