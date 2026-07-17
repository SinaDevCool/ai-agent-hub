import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VaultSchema } from "../../api/types";
import { AgentPermissionsTab } from "./AgentPermissionsTab";

const medicalSchema: VaultSchema = {
  id: "schema-medical",
  name: "Medical History",
  description: "Sensitive health context requiring explicit approval.",
  structuralTemplate: {}
};

const identitySchema: VaultSchema = {
  id: "schema-identity",
  name: "Personal Identity Profile",
  description: "Legal identity, address, and trusted contact fields.",
  structuralTemplate: {}
};

function renderPermissions(grantingSchemaName = "") {
  return renderToStaticMarkup(
    <AgentPermissionsTab
      allowedPermissionCount={1}
      grantAllRequestedSchemas={vi.fn()}
      grantingSchemaName={grantingSchemaName}
      grantRequestedSchema={vi.fn()}
      permissionReview={[
        { schema: medicalSchema, schemaName: medicalSchema.name, granted: false },
        { schema: identitySchema, schemaName: identitySchema.name, granted: true }
      ]}
      selectedIsExternal={false}
      togglePermission={vi.fn()}
      ungrantedRequestedSchemas={[{ schema: medicalSchema, schemaName: medicalSchema.name, granted: false }]}
    />
  );
}

describe("AgentPermissionsTab", () => {
  it("renders requested info controls without raw technical labels", () => {
    const markup = renderPermissions();

    expect(markup).toContain("This agent wants 2 saved info categories.");
    expect(markup).toContain("1 still need access.");
    expect(markup).toContain("Allow requested info");
    expect(markup).toContain("Remove access");
    expect(markup).not.toContain("vaultSchemaId");
  });

  it("shows bulk pending state while requested info is being allowed", () => {
    const markup = renderPermissions("all");

    expect(markup).toContain("Allowing…");
    expect(markup).toContain("Allowing requested info…");
  });

  it("shows per-row pending state while access is changing", () => {
    expect(renderPermissions("Medical History")).toContain("Allowing…");
    expect(renderPermissions("Medical History")).toContain("Updating Medical History…");
    expect(renderPermissions("Personal Identity Profile")).toContain("Removing…");
  });
});
