import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  APP_PUBLIC_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  FRONTEND_PUBLIC_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFICATION_FROM_EMAIL: z.string().min(3).default("AI Agent Hub <onboarding@resend.dev>"),
  MODERATOR_USER_IDS: z.string().default(""),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
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
  if (!value.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OPENAI_API_KEY is required in production for the agent runtime"
    });
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

export const frontendOrigins = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const resolvedVaultPath = path.resolve(process.cwd(), env.VAULT_LOCAL_PATH);

export const moderatorUserIds = env.MODERATOR_USER_IDS
  .split(",")
  .map((userId) => userId.trim())
  .filter(Boolean);
