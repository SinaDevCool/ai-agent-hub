import type { VaultSchema } from "../api/types";

const internalSchemaPrefixes = [
  "safety-",
  "creator-",
  "marketplace-",
  "lifecycle-",
  "workspace-",
  "smoke-",
  "test-",
  "demo-",
  "sample-",
  "qa-",
  "ui-clean-",
  "ui-mobile-"
];

const internalSchemaTerms = /\b(smoke|test|demo|sample|qa)\b/i;

export function isInternalPrivateInfoSchemaName(name: string) {
  const normalized = name.trim().toLowerCase();
  return internalSchemaPrefixes.some((prefix) => normalized.startsWith(prefix))
    || internalSchemaTerms.test(normalized);
}

export function publicPrivateInfoSchemas<TSchema extends Pick<VaultSchema, "name">>(schemas: TSchema[]) {
  return schemas.filter((schema) => !isInternalPrivateInfoSchemaName(schema.name));
}
