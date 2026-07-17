import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import {
  registerProviderAdapter,
  resolveConnectorProvider,
  unregisterConnectorProvider
} from "./services/connectorProviderRegistryService.js";
import { createProviderConnection } from "./services/providerConnectionService.js";
import type { ProviderAdapter } from "./services/providers/providerAdapterTypes.js";

const testRunId = `provider-contract-${Date.now()}`;
const providerId = `${testRunId}-custom-api`;
let server: Server;
let baseUrl = "";

const hotelInput = {
  message: "Find hotels",
  destination: "Lisbon",
  checkInDate: "2026-08-12",
  checkOutDate: "2026-08-16",
  guests: 2
};

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
      trustScore: 86,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["provider.execute"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider adapter contract test agent."
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

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "x-user-id": userId } });
}

before(() => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  const adapter: ProviderAdapter = {
    providerId,
    label: "Custom API provider",
    kind: "api",
    toolName: "custom.provider.execute",
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "api_key",
    riskLevel: "low",
    supportsHealthCheck: true,
    description: "A contract-test provider adapter.",
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== providerId) return false;
      return input.capabilityKey === "travel.search_hotels" && input.action === "search";
    },
    async execute(input) {
      return {
        status: "ok",
        toolRunId: `${testRunId}-tool-run-${input.attempt}`,
        result: {
          reply: "<script>alert(1)</script>Found a safe option.",
          externalRequestId: "contract-1",
          endpointHost: "api.example.test"
        }
      };
    },
    normalizeResult(input) {
      return {
        status: "ok",
        title: "<b>Hotel result</b>",
        summary: String(input.rawResult?.reply ?? ""),
        items: [{
          title: "<b>Central Stay</b>",
          subtitle: "Downtown",
          detail: "Good fit",
          price: "$120",
          url: "javascript:alert(1)"
        }],
        nextActions: [{ label: "Open unsafe", url: "javascript:alert(1)" }],
        receipt: {
          providerId,
          providerLabel: "Custom API provider",
          capabilityKey: input.capabilityKey,
          capabilityLabel: "Find hotels",
          action: input.action,
          toolRunId: input.toolRunId,
          externalRequestId: "contract-1",
          endpointHost: "api.example.test"
        }
      };
    }
  };
  registerProviderAdapter(adapter);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  unregisterConnectorProvider(providerId);
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("connector execution can run a registered provider adapter without knowing its backend kind", async () => {
  const { user, agent } = await createUserAndAgent("execute");
  await createProviderConnection({
    userId: user.id,
    providerId,
    credentials: { apiKey: "contract-test-key" }
  });
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("Expected provider adapter success.");
  assert.equal(result.providerId, providerId);
  assert.equal(result.result.title, "Hotel result");
  assert.equal(result.result.summary, "Found a safe option.");
  assert.equal(result.result.items[0]?.url, undefined);
  assert.equal(result.result.nextActions[0]?.url, undefined);

  const receipt = await prisma.providerReceipt.findFirstOrThrow({ where: { userId: user.id, providerId } });
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.externalRequestId, "contract-1");
});

test("provider discovery exposes contract metadata without secrets", async () => {
  const { user } = await createUserAndAgent("discovery");
  const response = await apiGet("/api/connectors/providers", user.id);
  assert.equal(response.status, 200);
  const body = await response.json() as {
    providers: Array<{ providerId: string; authType: string; capabilities: Array<{ key: string }>; health: Array<{ state: string }> }>;
  };
  const provider = body.providers.find((item) => item.providerId === providerId);
  assert.ok(provider);
  assert.equal(provider?.authType, "api_key");
  assert.ok(provider?.capabilities.some((capability) => capability.key === "travel.search_hotels"));
  assert.ok(provider?.health.length);
  assert.doesNotMatch(JSON.stringify(provider), /secret|token|password/i);
});

test("provider registry resolves adapter contracts by capability and action", () => {
  const provider = resolveConnectorProvider({
    capabilityKey: "travel.hotel.search",
    action: "search",
    preferredProviderId: providerId
  });
  assert.equal(provider?.providerId, providerId);
  assert.equal(provider?.kind, "api");
  assert.equal(provider?.authType, "api_key");
  assert.equal(typeof provider?.execute, "function");
});

test("provider registry honors adapter canHandle decisions", () => {
  const refusingProviderId = `${testRunId}-refusing-api`;
  const refusingAdapter: ProviderAdapter = {
    providerId: refusingProviderId,
    label: "Refusing API provider",
    kind: "api",
    toolName: "custom.provider.refusing",
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    supportsHealthCheck: false,
    description: "A provider that refuses routing at runtime.",
    canHandle() {
      return false;
    },
    async execute() {
      throw new Error("Refusing adapter should not execute.");
    }
  };
  registerProviderAdapter(refusingAdapter);
  try {
    const provider = resolveConnectorProvider({
      capabilityKey: "travel.hotel.search",
      action: "search",
      preferredProviderId: refusingProviderId
    });
    assert.equal(provider, null);
  } finally {
    unregisterConnectorProvider(refusingProviderId);
  }
});

test("provider registry rejects malformed adapter contracts before registration", () => {
  const malformedProviderId = `${testRunId}-bad adapter`;
  assert.throws(() => registerProviderAdapter({
    providerId: malformedProviderId,
    label: "Bad adapter",
    kind: "api",
    toolName: "custom.provider.bad",
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    supportsHealthCheck: false,
    description: "A malformed direct adapter.",
    canHandle() {
      return true;
    },
    async execute() {
      return { status: "ok", toolRunId: "bad" };
    }
  }), /safe stable identifier/i);
  assert.equal(resolveConnectorProvider({
    capabilityKey: "travel.search_hotels",
    action: "search",
    preferredProviderId: malformedProviderId
  }), null);
});
