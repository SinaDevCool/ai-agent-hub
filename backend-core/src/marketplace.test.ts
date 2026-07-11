import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AgentCategory, MarketplaceStatus, UserRole } from "@prisma/client";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");

const testRunId = `marketplace-${Date.now()}`;
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
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.agentVersion.deleteMany({ where: { agentDefinition: { slug: { startsWith: testRunId } } } });
  await prisma.agentDefinition.deleteMany({ where: { slug: { startsWith: testRunId } } });
  await prisma.agentVersion.deleteMany({ where: { agentDefinition: { name: { startsWith: testRunId } } } });
  await prisma.agentDefinition.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

async function createUser(suffix: string, role: UserRole = "user") {
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

async function createMarketplaceDefinition(input: {
  suffix: string;
  name: string;
  category?: AgentCategory;
  status?: MarketplaceStatus;
  isActive?: boolean;
  trustScore?: number;
  installCount?: number;
  manifest?: Record<string, unknown>;
}) {
  const definition = await prisma.agentDefinition.create({
    data: {
      slug: `${testRunId}-${input.suffix}`,
      name: `${testRunId} ${input.name}`,
      tagline: `${input.name} tagline`,
      description: `${input.name} description`,
      category: input.category ?? "Executive",
      status: input.status ?? "published",
      trustScore: input.trustScore ?? 70,
      installCount: input.installCount ?? 0,
      averageRating: 4.5
    }
  });
  await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: "1.0.0",
      apiProtocol: "MCP",
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["vault.search"],
        requestedSchemas: [],
        highRiskActions: [],
        description: `${input.name} manifest`,
        examplePrompts: [],
        trustReasons: [],
        ...input.manifest
      }),
      isActive: input.isActive ?? true
    }
  });
  return definition;
}

async function apiGet(path: string, userId?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: userId ? { "x-user-id": userId } : undefined
  });
}

async function apiPost(path: string, userId: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body)
  });
}

test("marketplace list returns only published helpers and supports category filtering", async () => {
  const user = await createUser("list-user");
  const custom = await createMarketplaceDefinition({ suffix: "published-custom", name: "Published Custom", category: "Custom" });
  await createMarketplaceDefinition({ suffix: "draft-custom", name: "Draft Custom", category: "Custom", status: "draft" });
  await createMarketplaceDefinition({ suffix: "published-finance", name: "Published Finance", category: "Financial" });

  const response = await apiGet("/api/marketplace/agents?category=Custom", user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { agents: Array<{ id: string; name: string; category: string }> };
  assert.deepEqual(data.agents.map((agent) => agent.id), [custom.id]);
  assert.equal(data.agents[0]?.category, "Custom");
});

test("external helper import previews endpoint safety and installs a personal restricted helper", async () => {
  const user = await createUser("external-import-user", "creator");
  const endpointUrl = `https://external.example.test/${testRunId}/private-path`;

  const unsafePreviewResponse = await apiPost("/api/external-agents/preview", user.id, {
    sourceType: "mcp_server",
    endpointUrl: "http://localhost:4141/mcp"
  });
  assert.equal(unsafePreviewResponse.status, 200);
  const unsafePreview = await unsafePreviewResponse.json() as { preview: { canInstall: boolean; blockers: string[] } };
  assert.equal(unsafePreview.preview.canInstall, false);
  assert.ok(unsafePreview.preview.blockers.some((blocker) => /https|localhost/i.test(blocker)));

  const unsafeImportResponse = await apiPost("/api/external-agents/import", user.id, {
    sourceType: "mcp_server",
    endpointUrl: "http://localhost:4141/mcp"
  });
  assert.equal(unsafeImportResponse.status, 400);

  const previewResponse = await apiPost("/api/external-agents/preview", user.id, {
    sourceType: "mcp_server",
    endpointUrl,
    displayName: `${testRunId} External Travel Helper`,
    category: "Travel"
  });
  assert.equal(previewResponse.status, 200);
  const previewBody = await previewResponse.json() as {
    preview: {
      canInstall: boolean;
      endpointHost: string;
      displayName: string;
      verificationStatus: string;
      capabilityManifest: { sourceType?: string; externalEndpointUrl?: string; verificationStatus?: string };
    };
  };
  assert.equal(previewBody.preview.canInstall, true);
  assert.equal(previewBody.preview.endpointHost, "external.example.test");
  assert.equal(previewBody.preview.displayName, `${testRunId} External Travel Helper`);
  assert.equal(previewBody.preview.verificationStatus, "verified");
  assert.equal(previewBody.preview.capabilityManifest.sourceType, "mcp_server");
  assert.equal(previewBody.preview.capabilityManifest.verificationStatus, "verified");

  const importResponse = await apiPost("/api/external-agents/import", user.id, {
    sourceType: "mcp_server",
    endpointUrl,
    displayName: `${testRunId} External Travel Helper`,
    category: "Travel"
  });
  assert.equal(importResponse.status, 201);
  const importBody = await importResponse.json() as {
    install: {
      displayName: string;
      connectionStatus: string;
      agent: { id: string; capabilityManifest: { sourceType?: string; verificationStatus?: string; externalEndpointUrl?: string } } | null;
      agentDefinition: { status: string; versions: Array<{ capabilityManifest: { sourceType?: string } }> };
    };
  };
  assert.equal(importBody.install.displayName, `${testRunId} External Travel Helper`);
  assert.equal(importBody.install.connectionStatus, "restricted");
  assert.equal(importBody.install.agent?.capabilityManifest.sourceType, "mcp_server");
  assert.equal(importBody.install.agent?.capabilityManifest.verificationStatus, "verified");
  assert.equal(importBody.install.agentDefinition.status, "archived");

  const duplicateResponse = await apiPost("/api/external-agents/import", user.id, {
    sourceType: "mcp_server",
    endpointUrl,
    displayName: `${testRunId} External Travel Helper`,
    category: "Travel"
  });
  assert.equal(duplicateResponse.status, 200);

  const logs = await prisma.activityLog.findMany({
    where: { userId: user.id, actionType: "agent_created" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(logs.some((log) => log.dynamicMetadata.includes("external_agent_import")));
});

test("marketplace list and install hide internal QA and smoke helpers", async () => {
  const user = await createUser("internal-hidden-user");
  const publicHelper = await createMarketplaceDefinition({ suffix: "public-helper", name: "Public Travel Helper", category: "Travel" });
  const qaHelper = await createMarketplaceDefinition({ suffix: "qa-helper-internal", name: "QA Helper Travel", category: "Travel" });
  await createMarketplaceDefinition({ suffix: "smoke-helper-internal", name: "Smoke Helper Travel", category: "Travel" });

  const response = await apiGet("/api/marketplace/agents?category=Travel", user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { agents: Array<{ id: string; name: string }> };
  assert.ok(data.agents.some((agent) => agent.id === publicHelper.id));
  assert.ok(data.agents.every((agent) => agent.id !== qaHelper.id));
  assert.ok(data.agents.every((agent) => !/QA Helper|Smoke Helper/.test(agent.name)));

  const installResponse = await apiPost(`/api/marketplace/agents/${qaHelper.id}/install`, user.id, {});
  assert.equal(installResponse.status, 404);
});

test("marketplace search matches manifest fields and returns ranked results", async () => {
  const user = await createUser("search-user");
  const uniqueSearchNeedle = `${testRunId}-resume-needle`;
  const jobCoach = await createMarketplaceDefinition({
    suffix: "job-coach",
    name: "General Coach",
    trustScore: 82,
    installCount: 10,
    manifest: {
      requestedSchemas: [`${testRunId} Career Profile`],
      examplePrompts: [`Tailor my resume with ${uniqueSearchNeedle} for a job application`],
      trustReasons: ["Drafts but does not submit applications"]
    }
  });
  await createMarketplaceDefinition({
    suffix: "weak-application-match",
    name: "Application Archive",
    trustScore: 95,
    installCount: 3000,
    manifest: {
      examplePrompts: [`Organize old ${testRunId}-resume receipts`]
    }
  });
  await createMarketplaceDefinition({
    suffix: "unrelated-helper",
    name: "Garden Planner",
    manifest: {
      examplePrompts: ["Plan weekend home errands"]
    }
  });

  const response = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(uniqueSearchNeedle)}`, user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { agents: Array<{ id: string; matchScore?: number; matchReasons?: string[] }> };
  assert.equal(data.agents[0]?.id, jobCoach.id);
  assert.ok(data.agents.some((agent) => agent.id === jobCoach.id));
  assert.ok(data.agents.every((agent) => typeof agent.matchScore === "number"));
  assert.ok((data.agents[0]?.matchReasons?.length ?? 0) > 0);
});

test("marketplace search matches actions and trust details", async () => {
  const user = await createUser("action-search-user");
  const actionNeedle = `transfer-funds-${Date.now()}`;
  const trustNeedle = `approval-receipt-${Date.now()}`;
  const actionHelper = await createMarketplaceDefinition({
    suffix: "action-search",
    name: "Safety Operator",
    manifest: {
      tools: ["action.execute"],
      highRiskActions: [actionNeedle],
      trustReasons: [`${trustNeedle} before money moves`]
    }
  });
  await createMarketplaceDefinition({
    suffix: "no-action-search",
    name: "Readonly Organizer",
    manifest: {
      tools: ["vault.search"],
      examplePrompts: ["Summarize notes"]
    }
  });

  const actionResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(actionNeedle)}`, user.id);
  assert.equal(actionResponse.status, 200);
  const actionData = await actionResponse.json() as { agents: Array<{ id: string; matchReasons?: string[] }> };
  assert.equal(actionData.agents[0]?.id, actionHelper.id);
  assert.ok(actionData.agents[0]?.matchReasons?.includes("Matches available helper actions"));

  const trustResponse = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(trustNeedle)}`, user.id);
  assert.equal(trustResponse.status, 200);
  const trustData = await trustResponse.json() as { agents: Array<{ id: string; matchReasons?: string[] }> };
  assert.equal(trustData.agents[0]?.id, actionHelper.id);
  assert.ok(trustData.agents[0]?.matchReasons?.includes("Matches trust and safety details"));
});

test("marketplace search supports everyday B2C goal words", async () => {
  const user = await createUser("b2c-search-user");
  const helpers = [
    await createMarketplaceDefinition({
      suffix: "b2c-travel",
      name: "Weekend Trip Helper",
      category: "Travel",
      manifest: {
        requestedSchemas: ["Frequent Flyer Ledger"],
        highRiskActions: ["book_non_refundable_travel"],
        examplePrompts: ["Plan a trip with flights, hotels, and an itinerary"],
        trustReasons: ["Asks before booking travel"]
      }
    }),
    await createMarketplaceDefinition({
      suffix: "b2c-jobs",
      name: "Job Application Helper",
      category: "Executive",
      manifest: {
        tools: ["vault.search", "email.draft"],
        requestedSchemas: ["Career Profile"],
        highRiskActions: ["submit_application"],
        examplePrompts: ["Draft a resume summary and cover letter for this job"],
        trustReasons: ["Drafts applications before submitting"]
      }
    }),
    await createMarketplaceDefinition({
      suffix: "b2c-money",
      name: "Money Budget Helper",
      category: "Financial",
      manifest: {
        requestedSchemas: ["Financial Preferences"],
        highRiskActions: ["transfer_funds"],
        examplePrompts: ["Manage money, bills, cards, subscriptions, and budget tradeoffs"],
        trustReasons: ["Cannot move money without approval"]
      }
    }),
    await createMarketplaceDefinition({
      suffix: "b2c-email",
      name: "Email Follow-Up Helper",
      category: "Executive",
      manifest: {
        tools: ["vault.search", "email.draft"],
        requestedSchemas: ["Contact Preferences"],
        highRiskActions: ["send_email"],
        examplePrompts: ["Handle emails, draft replies, and organize follow-ups"],
        trustReasons: ["Never sends email without approval"]
      }
    }),
    await createMarketplaceDefinition({
      suffix: "b2c-health",
      name: "Health Notes Helper",
      category: "Wellness",
      manifest: {
        requestedSchemas: ["Health Notes"],
        highRiskActions: ["share_medical_record"],
        examplePrompts: ["Organize health notes, symptoms, medicines, and doctor questions"],
        trustReasons: ["Keeps health details restricted"]
      }
    }),
    await createMarketplaceDefinition({
      suffix: "b2c-shopping",
      name: "Purchase Comparison Helper",
      category: "Domestic",
      manifest: {
        requestedSchemas: ["Financial Preferences"],
        highRiskActions: ["buy_item"],
        examplePrompts: ["Compare purchases, prices, product options, and subscriptions"],
        trustReasons: ["Asks before buying anything"]
      }
    })
  ];
  const scenarios = [
    { search: "plan a trip", expectedId: helpers[0].id },
    { search: "apply for jobs resume", expectedId: helpers[1].id },
    { search: "manage money budget", expectedId: helpers[2].id },
    { search: "handle emails", expectedId: helpers[3].id },
    { search: "organize health notes", expectedId: helpers[4].id },
    { search: "compare purchases", expectedId: helpers[5].id }
  ];

  for (const scenario of scenarios) {
    const response = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(scenario.search)}`, user.id);
    assert.equal(response.status, 200);
    const data = await response.json() as { agents: Array<{ id: string; matchScore?: number; matchReasons?: string[] }> };
    const expected = data.agents.find((agent) => agent.id === scenario.expectedId);
    assert.ok(expected, scenario.search);
    assert.ok((expected.matchScore ?? 0) > 0, scenario.search);
    assert.ok((expected.matchReasons?.length ?? 0) > 0, scenario.search);
  }
});

test("marketplace list marks installed helpers and exposes only active versions", async () => {
  const user = await createUser("installed-list-user");
  const definition = await createMarketplaceDefinition({
    suffix: "installed-active-version",
    name: "Installed Active Version",
    manifest: {
      examplePrompts: [`${testRunId} active prompt`]
    }
  });
  await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: "0.9.0",
      apiProtocol: "MCP",
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["vault.search"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "inactive manifest",
        examplePrompts: [`${testRunId} inactive prompt`],
        trustReasons: []
      }),
      isActive: false
    }
  });

  const installResponse = await apiPost(`/api/marketplace/agents/${definition.id}/install`, user.id, {});
  assert.equal(installResponse.status, 201);

  const listResponse = await apiGet("/api/marketplace/agents", user.id);
  assert.equal(listResponse.status, 200);
  const data = await listResponse.json() as {
    agents: Array<{
      id: string;
      installed?: boolean;
      versions: Array<{ capabilityManifest: { examplePrompts?: string[] } }>;
    }>;
  };
  const listed = data.agents.find((agent) => agent.id === definition.id);
  assert.equal(listed?.installed, true);
  assert.equal(listed?.versions.length, 1);
  assert.deepEqual(listed?.versions[0]?.capabilityManifest.examplePrompts, [`${testRunId} active prompt`]);
});

test("marketplace install creates one install, resolves name conflicts, and increments count once", async () => {
  const user = await createUser("install-user");
  const definition = await createMarketplaceDefinition({
    suffix: "installable",
    name: "Installable Helper",
    installCount: 4,
    manifest: {
      tools: ["vault.search", "action.execute"],
      requestedSchemas: ["Financial Preferences"],
      highRiskActions: ["transfer_funds"],
      examplePrompts: ["Help me stay under budget this month"],
      trustReasons: ["Cannot move money without approval"]
    }
  });
  await prisma.agent.create({
    data: {
      name: `${testRunId} Installable Helper`,
      category: "Executive",
      apiProtocol: "MCP",
      trustScore: 60,
      capabilityManifest: encodeJson({ protocol: "MCP", tools: [] }),
      connections: {
        create: {
          userId: user.id,
          connectionStatus: "active",
          tokenExpiresAt: new Date(Date.now() + 60_000)
        }
      }
    }
  });

  const firstResponse = await apiPost(`/api/marketplace/agents/${definition.id}/install`, user.id, {});
  assert.equal(firstResponse.status, 201);
  const firstData = await firstResponse.json() as {
    install: {
      displayName: string;
      agent?: { id: string; capabilityManifest?: { requestedSchemas?: string[]; highRiskActions?: string[] } };
      agentDefinition?: { versions?: Array<{ capabilityManifest?: { trustReasons?: string[] } }> };
      agentVersion?: { capabilityManifest?: { examplePrompts?: string[] } };
    };
  };
  assert.equal(firstData.install.displayName, `${testRunId} Installable Helper 2`);
  assert.ok(firstData.install.agent?.id);
  assert.deepEqual(firstData.install.agent?.capabilityManifest?.requestedSchemas, ["Financial Preferences"]);
  assert.deepEqual(firstData.install.agent?.capabilityManifest?.highRiskActions, ["transfer_funds"]);
  assert.deepEqual(firstData.install.agentVersion?.capabilityManifest?.examplePrompts, ["Help me stay under budget this month"]);
  assert.deepEqual(firstData.install.agentDefinition?.versions?.[0]?.capabilityManifest?.trustReasons, ["Cannot move money without approval"]);

  const afterFirstInstall = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: definition.id } });
  assert.equal(afterFirstInstall.installCount, 5);

  const secondResponse = await apiPost(`/api/marketplace/agents/${definition.id}/install`, user.id, {});
  assert.equal(secondResponse.status, 200);
  const secondData = await secondResponse.json() as { install: { displayName: string; agent?: { id: string } } };
  assert.equal(secondData.install.displayName, firstData.install.displayName);
  assert.equal(secondData.install.agent?.id, firstData.install.agent?.id);

  const afterSecondInstall = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: definition.id } });
  assert.equal(afterSecondInstall.installCount, 5);
});

test("marketplace install blocks unavailable helpers and helpers without an active version", async () => {
  const user = await createUser("blocked-install-user");
  const draft = await createMarketplaceDefinition({ suffix: "draft-blocked", name: "Draft Blocked", status: "draft" });
  const noActiveVersion = await createMarketplaceDefinition({
    suffix: "no-active-version",
    name: "No Active Version",
    isActive: false
  });

  const draftResponse = await apiPost(`/api/marketplace/agents/${draft.id}/install`, user.id, {});
  assert.equal(draftResponse.status, 404);
  const draftData = await draftResponse.json() as { error: { message: string } };
  assert.match(draftData.error.message, /not available/i);

  const inactiveResponse = await apiPost(`/api/marketplace/agents/${noActiveVersion.id}/install`, user.id, {});
  assert.equal(inactiveResponse.status, 409);
  const inactiveData = await inactiveResponse.json() as { error: { message: string } };
  assert.match(inactiveData.error.message, /active version/i);
});
