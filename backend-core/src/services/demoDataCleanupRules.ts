const helperNamePrefixes = [
  "qa helper",
  "audit helper",
  "grant agent",
  "smoke",
  "smoke helper",
  "test agent",
  "test helper",
  "demo helper",
  "sample helper",
  "my travel planner",
  "resubmit qa helper",
  "review approve qa helper",
  "weekend trip qa helper"
];

const marketplaceSlugPrefixes = [
  "qa-helper",
  "smoke",
  "test-helper",
  "demo-helper"
];

const documentTitlePrefixes = [
  "smoke",
  "smoke vault item",
  "smoke upload",
  "travel planner starter note",
  "test vault item",
  "demo vault item"
];

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

const testUserPrefixes = [
  "safety-",
  "creator-",
  "marketplace-",
  "lifecycle-",
  "workspace-",
  "ui-clean-",
  "ui-mobile-",
  "smoke-",
  "test-",
  "demo-",
  "sample-",
  "qa-"
];

const internalTerms = /\b(smoke|test|demo|sample|qa)\b/i;

export function normalizeCleanupValue(value: string) {
  return value.trim().toLowerCase();
}

export function startsWithAnyCleanupPrefix(value: string, prefixes: string[]) {
  const normalizedValue = normalizeCleanupValue(value);
  return prefixes.some((prefix) => normalizedValue.startsWith(prefix));
}

export function isDemoAgentName(name: string) {
  return startsWithAnyCleanupPrefix(name, helperNamePrefixes);
}

export function isDemoMarketplaceSlug(slug: string) {
  return startsWithAnyCleanupPrefix(slug, marketplaceSlugPrefixes);
}

export function isDemoDocumentTitle(title: string) {
  return startsWithAnyCleanupPrefix(title, documentTitlePrefixes);
}

export function isDemoVaultSchemaName(name: string) {
  const normalized = normalizeCleanupValue(name);
  return startsWithAnyCleanupPrefix(normalized, internalSchemaPrefixes) || internalTerms.test(normalized);
}

export function isDemoUserId(userId: string | null | undefined) {
  return Boolean(userId && startsWithAnyCleanupPrefix(userId, testUserPrefixes));
}

export function isDemoPermissionReference(input: { userId: string | null; agentName?: string | null }) {
  return isDemoUserId(input.userId) || Boolean(input.agentName && isDemoAgentName(input.agentName));
}

export function schemaBlockReason(input: {
  documentTitles: string[];
  permissionRefs: Array<{ userId: string | null; agentName?: string | null }>;
}) {
  const hasRealDocument = input.documentTitles.some((title) => !isDemoDocumentTitle(title));
  if (hasRealDocument) return "referenced by non-demo private info";

  const hasRealPermission = input.permissionRefs.some((permission) => !isDemoPermissionReference(permission));
  if (hasRealPermission) return "referenced by non-demo helper permissions";

  return "";
}
