import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).optional(),
  RELEASE_SHA: z.string().min(7).max(64).optional(),
  RENDER_GIT_COMMIT: z.string().min(7).max(64).optional(),
  BUILD_TIMESTAMP: z.string().datetime().optional(),
  MIGRATION_VERSION: z.string().min(1).default("0018_enable_rls"),
  PORT: z.coerce.number().int().positive().default(4141),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().refine(
    (value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .every((origin) => z.string().url().safeParse(origin).success),
    "FRONTEND_ORIGIN must be one or more comma-separated URLs"
  ).default("http://localhost:5173"),
  VAULT_LOCAL_PATH: z.string().min(1).default("./vault-samples/personal-vault"),
  VAULT_ENCRYPTION_KEY: z.string().min(24),
  SYNC_MODE: z.enum(["local", "self_hosted", "encrypted_cloud_backup"]).default("local"),
  LOG_LEVEL: z.string().default("info"),
  EMBEDDING_PROVIDER: z.enum(["local-hash", "ollama"]).default("local-hash"),
  OLLAMA_EMBEDDING_URL: z.string().url().default("http://localhost:11434/api/embeddings"),
  OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  AI_RUNTIME_MODE: z.enum(["rules", "local", "hybrid", "cloud"]).default("rules"),
  CLOUD_LLM_PROVIDER: z.enum(["openai"]).default("openai"),
  CLOUD_LLM_FALLBACK_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCAL_AI_ENABLED: z.enum(["true", "false"]).default("true"),
  LOCAL_AI_PLAN_ENDPOINT_ENABLED: z.enum(["true", "false"]).default("true"),
  LOCAL_RESPONSE_GENERATION_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCAL_EMBEDDINGS_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCAL_AI_MODEL_3B_ENABLED: z.enum(["true", "false"]).default("true"),
  LOCAL_AI_MODEL_8B_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCAL_AI_KILL_SWITCH: z.enum(["true", "false"]).default("false"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  APP_PUBLIC_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  FRONTEND_PUBLIC_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFICATION_FROM_EMAIL: z.string().min(3).default("AI Agent Hub <onboarding@resend.dev>"),
  MODERATOR_USER_IDS: z.string().default(""),
  OPENAI_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  DURABLE_JOBS_ENABLED: z.enum(["true", "false"]).default("false"),
  DURABLE_JOB_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  DURABLE_JOB_LEASE_MS: z.coerce.number().int().min(5000).max(900000).default(60000),
  DURABLE_JOB_POLL_MS: z.coerce.number().int().min(250).max(60000).default(2000),
  LIVE_TRAVEL_ENABLED: z.enum(["true", "false"]).default("false"),
  LIVE_APPOINTMENTS_ENABLED: z.enum(["true", "false"]).default("false"),
  APPOINTMENTS_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  CALCOM_WEBHOOK_SECRET: z.string().min(24).optional(),
  CALCOM_WEBHOOK_REPLAY_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  LIVE_FINANCE_ENABLED: z.enum(["true", "false"]).default("false"),
  FINANCE_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  LIVE_SHOPPING_ENABLED: z.enum(["true", "false"]).default("false"),
  HOSTED_SHOPPING_CHECKOUT_ENABLED: z.enum(["true", "false"]).default("false"),
  SHOPPING_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  INSTACART_API_KEY: z.string().min(1).optional(),
  INSTACART_API_ENV: z.enum(["development", "production"]).default("development"),
  LIVE_HOUSEHOLD_ENABLED: z.enum(["true", "false"]).default("false"),
  HOSTED_HOUSEHOLD_HANDOFF_ENABLED: z.enum(["true", "false"]).default("false"),
  HOUSEHOLD_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  LIVE_LEISURE_ENABLED: z.enum(["true", "false"]).default("false"),
  HOSTED_LEISURE_HANDOFF_ENABLED: z.enum(["true", "false"]).default("false"),
  LEISURE_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  TICKETMASTER_API_KEY: z.string().min(1).optional(),
  LIVE_SMART_HOME_READ_ENABLED: z.enum(["true", "false"]).default("false"),
  LIVE_SMART_HOME_CONTROL_ENABLED: z.enum(["true", "false"]).default("false"),
  SMART_HOME_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  HOME_ASSISTANT_ALLOWED_ORIGINS: z.string().default(""),
  LIVE_WELLNESS_ENABLED: z.enum(["true", "false"]).default("false"),
  WELLNESS_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  STRAVA_CLIENT_ID: z.string().min(1).optional(),
  STRAVA_CLIENT_SECRET: z.string().min(1).optional(),
  HOSTED_TRAVEL_CHECKOUT_ENABLED: z.enum(["true", "false"]).default("false"),
  TRAVEL_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  TRAVEL_LAUNCH_REGIONS: z.string().default("DE,EU"),
  TRAVEL_LAUNCH_CURRENCIES: z.string().default("EUR"),
  TRAVEL_CHECKOUT_HOSTS: z.string().default(""),
  PRIVATE_BETA_ENFORCED: z.enum(["true", "false"]).default("false"),
  PRIVACY_RIGHTS_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVACY_EXPORT_EXECUTOR_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVACY_EXPORT_PATH: z.string().min(1).default("./private-exports"),
  PRIVACY_EXPORT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PRIVACY_DELETION_GRACE_HOURS: z.coerce.number().int().min(24).max(720).default(168),
  VERTICAL_RELEASE_GATING_ENABLED: z.enum(["true", "false"]).default("false"),
  VERTICAL_RELEASE_RULES: z.string().default("{}"),
  OPS_ALERT_DEAD_LETTER_WARN: z.coerce.number().int().min(1).max(100000).default(1),
  OPS_ALERT_RECONCILIATION_WARN: z.coerce.number().int().min(1).max(100000).default(1),
  OPS_ALERT_OLDEST_JOB_MINUTES: z.coerce.number().int().min(1).max(10080).default(15),
  OPS_ALERT_PROVIDER_FAILURES_15M: z.coerce.number().int().min(1).max(100000).default(5),
  BETA_COHORT_LIMITS: z.string().default('{"team":25,"trusted":5,"early":25,"expanded":100}'),
  BETA_CAPABILITY_RULES: z.string().default("{}"),
  EXTERNAL_RUNTIME_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1000).max(200000).default(60000),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional()
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "production") return;

  if (!value.SUPABASE_URL || !value.SUPABASE_ANON_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SUPABASE_URL and SUPABASE_ANON_KEY are required in production"
    });
  }
  if (!value.DIRECT_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DIRECT_URL is required in production for PostgreSQL migrations"
    });
  }
  if ((value.AI_RUNTIME_MODE === "cloud" || value.CLOUD_LLM_FALLBACK_ENABLED === "true") && !value.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OPENAI_API_KEY is required when cloud AI or cloud fallback is enabled"
    });
  }
  if (value.EMBEDDING_PROVIDER === "local-hash" && value.LOCAL_EMBEDDINGS_ENABLED === "true") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "LOCAL_EMBEDDINGS_ENABLED requires a semantic embedding provider; local-hash is test-only" });
  }
  if (value.LIVE_APPOINTMENTS_ENABLED === "true" && !value.CALCOM_WEBHOOK_SECRET) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CALCOM_WEBHOOK_SECRET is required when live appointments are enabled" });
  }
  if (value.LIVE_SHOPPING_ENABLED === "true" && !value.INSTACART_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "INSTACART_API_KEY is required when live shopping is enabled" });
  }
  if (value.LIVE_HOUSEHOLD_ENABLED === "true" && !value.GOOGLE_PLACES_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "GOOGLE_PLACES_API_KEY is required when live household discovery is enabled" });
  }
  if (value.LIVE_LEISURE_ENABLED === "true" && (!value.GOOGLE_PLACES_API_KEY || !value.TICKETMASTER_API_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "GOOGLE_PLACES_API_KEY and TICKETMASTER_API_KEY are required when live leisure is enabled" });
  }
  if ((value.LIVE_SMART_HOME_READ_ENABLED === "true" || value.LIVE_SMART_HOME_CONTROL_ENABLED === "true") && !value.HOME_ASSISTANT_ALLOWED_ORIGINS.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "HOME_ASSISTANT_ALLOWED_ORIGINS is required when live smart-home access is enabled" });
  }
  if (value.LIVE_WELLNESS_ENABLED === "true" && (!value.STRAVA_CLIENT_ID || !value.STRAVA_CLIENT_SECRET)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required when live wellness is enabled" });
  }
  if (!process.env.FRONTEND_ORIGIN) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "FRONTEND_ORIGIN is required in production"
    });
  }
  if (!value.API_PUBLIC_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "API_PUBLIC_URL is required in production" });
  }
  if (Boolean(value.UPSTASH_REDIS_REST_URL) !== Boolean(value.UPSTASH_REDIS_REST_TOKEN)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Both Upstash Redis REST settings must be configured together" });
  }
  if (value.FRONTEND_ORIGIN.split(",").some((origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.trim()))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "FRONTEND_ORIGIN cannot include localhost origins in production"
    });
  }
});

export const env = schema.parse(process.env);

export const deploymentInfo = {
  environment: env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "local"),
  releaseSha: env.RELEASE_SHA ?? env.RENDER_GIT_COMMIT ?? "development",
  buildTimestamp: env.BUILD_TIMESTAMP ?? null,
  migrationVersion: env.MIGRATION_VERSION
} as const;

const configuredFrontendOrigins = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const frontendOrigins = [...new Set([
  ...configuredFrontendOrigins,
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost"
])];

export const resolvedVaultPath = path.resolve(process.cwd(), env.VAULT_LOCAL_PATH);

export const moderatorUserIds = env.MODERATOR_USER_IDS
  .split(",")
  .map((userId) => userId.trim())
  .filter(Boolean);
