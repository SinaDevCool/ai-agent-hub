import { describe, expect, it } from "vitest";
import { externalLogDisplay, externalRuntimeSummary, hostFromAgent, parseExternalRuntime } from "./externalRuntimeDisplay";
import type { ActivityLog, Agent } from "../api/types";

describe("external runtime display", () => {
  it("renders plain language labels", () => {
    const runtime = parseExternalRuntime({
      source: "external_agent_runtime",
      sourceType: "mcp_server",
      endpointHost: "external.example.test",
      proxyStatus: "executed",
      durationMs: 842
    });

    expect(externalRuntimeSummary(runtime)).toBe("External helper response");
  });

  it("hides full endpoint urls and shows host in activity rows", () => {
    const log = {
      id: "log-1",
      actionType: "api_callback",
      status: "success",
      hash: "hash",
      createdAt: new Date().toISOString(),
      dynamicMetadata: {
        source: "external_agent_runtime",
        sourceType: "openapi_endpoint",
        endpointHost: "external.example.test",
        externalEndpointUrl: "https://external.example.test/secret/path",
        proxyStatus: "executed",
        usedSchemas: ["Travel Preferences"],
        durationMs: 25
      }
    } satisfies ActivityLog;

    const display = externalLogDisplay(log);
    expect(display?.title).toBe("External helper ran through AI Agent Hub");
    expect(display?.detail ?? "").toMatch(/external\.example\.test/);
    expect(display?.detail ?? "").not.toMatch(/secret\/path/);
    expect(display?.detail ?? "").toMatch(/Travel Preferences/);
  });

  it("returns hostname without leaking path", () => {
    const agent = {
      capabilityManifest: {
        sourceType: "openapi_endpoint",
        externalEndpointUrl: "https://external.example.test/private/runtime"
      }
    } as Agent;

    expect(hostFromAgent(agent)).toBe("external.example.test");
  });
});
