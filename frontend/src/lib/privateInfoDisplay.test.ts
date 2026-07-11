import { describe, expect, it } from "vitest";
import { isInternalPrivateInfoSchemaName, publicPrivateInfoSchemas } from "./privateInfoDisplay";

describe("private info display filters", () => {
  it("identifies test and internal schema names", () => {
    expect(isInternalPrivateInfoSchemaName("safety-1783586760301-Financial Preferences")).toBe(true);
    expect(isInternalPrivateInfoSchemaName("creator-1783586760301-Career Profile")).toBe(true);
    expect(isInternalPrivateInfoSchemaName("Smoke Travel Preferences")).toBe(true);
    expect(isInternalPrivateInfoSchemaName("QA Financial Preferences")).toBe(true);
  });

  it("keeps normal B2C category names visible", () => {
    expect(isInternalPrivateInfoSchemaName("Financial Preferences")).toBe(false);
    expect(isInternalPrivateInfoSchemaName("Medical History")).toBe(false);
    expect(isInternalPrivateInfoSchemaName("Personal Identity Profile")).toBe(false);
    expect(isInternalPrivateInfoSchemaName("Frequent Flyer Ledger")).toBe(false);
  });

  it("filters internal schemas without changing normal ordering", () => {
    const schemas = [
      { id: "financial", name: "Financial Preferences" },
      { id: "safety", name: "safety-1783586760301-Financial Preferences" },
      { id: "medical", name: "Medical History" },
      { id: "smoke", name: "Smoke Travel Preferences" }
    ];

    expect(publicPrivateInfoSchemas(schemas).map((schema) => schema.name)).toEqual([
      "Financial Preferences",
      "Medical History"
    ]);
  });
});
