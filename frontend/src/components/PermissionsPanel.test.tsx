import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Agent, VaultSchema } from "../api/types";
import { PermissionsPanel } from "./PermissionsPanel";

const travelSchema: VaultSchema = {
  id: "schema-travel",
  name: "Frequent Flyer Ledger",
  description: "Loyalty programs, travel documents, and seat preferences.",
  structuralTemplate: {}
};

const identitySchema: VaultSchema = {
  id: "schema-identity",
  name: "Personal Identity Profile",
  description: "Legal identity, address, and trusted contact fields.",
  structuralTemplate: {}
};

const concierge: Agent = {
  id: "agent-concierge",
  name: "The Concierge",
  category: "Travel",
  apiProtocol: "MCP",
  trustScore: 78,
  capabilityManifest: {
    requestedSchemas: [travelSchema.name, identitySchema.name],
    highRiskActions: ["book_non_refundable_travel"]
  },
  permissions: [
    {
      id: "permission-travel",
      permissionType: "read",
      restrictionRules: {},
      vaultSchemaId: travelSchema.id,
      vaultSchema: travelSchema
    }
  ],
  connections: []
};

describe("PermissionsPanel", () => {
  it("shows explicit allow and remove actions for the access happy path", () => {
    const markup = renderToStaticMarkup(
      <PermissionsPanel
        allowedPermissionCount={1}
        approvalCount={0}
        className="panel"
        onAddPrivateInfo={vi.fn()}
        onTogglePermission={vi.fn()}
        grantingSchemaName=""
        notice=""
        permissionCenterRows={[
          { schema: travelSchema, allowedAgents: [concierge], requestingAgents: [concierge] },
          { schema: identitySchema, allowedAgents: [], requestingAgents: [concierge] }
        ]}
        selectedAgent={concierge}
        ungrantedRequestedCount={1}
      />
    );

    expect(markup).toContain("The Concierge is asking to use this saved info.");
    expect(markup).toContain("Allow access");
    expect(markup).toContain("Remove access");
    expect(markup).toContain("Allow access to Personal Identity Profile for The Concierge");
    expect(markup).not.toContain("vaultSchemaId");
  });
});
