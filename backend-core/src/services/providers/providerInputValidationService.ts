import type { ProviderActionSchema, ProviderSchemaFieldType } from "./providerAdapterTypes.js";

export type ProviderInputValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; userMessage: string; technicalMessage: string; missingFields?: string[]; invalidFields?: string[] };

function hasValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isClearDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  if (typeof value !== "string") return false;
  const text = value.trim();
  return Boolean(text) && (
    /^\d{4}-\d{2}-\d{2}$/.test(text)
    || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)
    || /today|tomorrow|weekend|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(text)
  );
}

function matchesType(value: unknown, type: ProviderSchemaFieldType) {
  if (!hasValue(value)) return true;
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "date") return isClearDate(value);
  return true;
}

function cleanString(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function normalizeValue(value: unknown, type: ProviderSchemaFieldType) {
  if (!hasValue(value)) return undefined;
  if (type === "string" || type === "date") return typeof value === "string" ? cleanString(value) : value;
  if (type === "number") return value;
  if (type === "boolean") return value;
  if (type === "array") return Array.isArray(value)
    ? value.slice(0, 40).map((item) => typeof item === "string" ? cleanString(item) : item).filter(hasValue)
    : value;
  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [
      key.trim().slice(0, 80),
      typeof item === "string" ? cleanString(item) : item
    ]));
  }
  return value;
}

function normalizedProviderValues(schema: ProviderActionSchema, values: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [field, config] of Object.entries(schema.inputSchema)) {
    const value = normalizeValue(values[field], config.type);
    if (value !== undefined) normalized[field] = value;
  }
  if (schema.allowExtraFields) {
    for (const [field, value] of Object.entries(values)) {
      if (field in normalized || field in schema.inputSchema) continue;
      if (/secret|token|password|authorization|cookie|api[_-]?key/i.test(field)) continue;
      if (typeof value === "string") normalized[field.trim().slice(0, 80)] = cleanString(value);
      else if (typeof value === "number" || typeof value === "boolean" || value === null) normalized[field.trim().slice(0, 80)] = value;
    }
  }
  return normalized;
}

export function validateProviderInput(input: {
  schema: ProviderActionSchema;
  values: Record<string, unknown>;
}): ProviderInputValidationResult {
  const missingFields = input.schema.requiredFields.filter((field) => !hasValue(input.values[field]));
  if (missingFields.length) {
    return {
      ok: false,
      userMessage: input.schema.missingInputMessage,
      technicalMessage: `Missing required provider input fields: ${missingFields.join(", ")}.`,
      missingFields
    };
  }
  const invalidFields = Object.entries(input.schema.inputSchema)
    .filter(([field, config]) => !matchesType(input.values[field], config.type))
    .map(([field]) => field);
  if (invalidFields.length) {
    return {
      ok: false,
      userMessage: "Check the details for this request. The agent needs them in a clearer format before using this provider.",
      technicalMessage: `Invalid provider input fields: ${invalidFields.join(", ")}.`,
      invalidFields
    };
  }
  return { ok: true, values: normalizedProviderValues(input.schema, input.values) };
}
