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
  APP_PUBLIC_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFICATION_FROM_EMAIL: z.string().min(3).default("AI Agent Hub <onboarding@resend.dev>")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && (!value.SUPABASE_URL || !value.SUPABASE_ANON_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SUPABASE_URL and SUPABASE_ANON_KEY are required in production"
    });
  }
});

export const env = schema.parse(process.env);

export const frontendOrigins = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const resolvedVaultPath = path.resolve(process.cwd(), env.VAULT_LOCAL_PATH);
