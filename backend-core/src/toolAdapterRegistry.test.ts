import assert from "node:assert/strict";
import { test } from "node:test";
import { getToolDefinition } from "./services/toolRegistryService.js";
import { getAdapterForTool, listToolAdapters } from "./services/tools/adapterRegistry.js";

test("tool adapter registry routes native and Google tools by adapter type", () => {
  const vault = getToolDefinition("vault.search");
  const email = getToolDefinition("email.search");
  const travel = getToolDefinition("travel.search_hotels");

  assert.ok(vault);
  assert.ok(email);
  assert.ok(travel);
  assert.equal(vault.adapterType, "native");
  assert.equal(email.adapterType, "oauth_api");
  assert.equal(travel.adapterType, "webhook");
  assert.equal(getAdapterForTool(vault).type, "native");
  assert.equal(getAdapterForTool(email).type, "oauth_api");
  assert.equal(getAdapterForTool(travel).type, "webhook");
  assert.deepEqual(Array.from(new Set(listToolAdapters())), ["native", "oauth_api", "webhook"]);
});
