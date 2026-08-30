import { Router } from "express";
import { deploymentInfo, env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "backend-core",
    environment: deploymentInfo.environment,
    release: {
      sha: deploymentInfo.releaseSha,
      buildTimestamp: deploymentInfo.buildTimestamp,
      migrationVersion: deploymentInfo.migrationVersion
    },
    syncMode: env.SYNC_MODE,
    database: {
      configured: Boolean(env.DATABASE_URL)
    },
    auth: {
      configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY)
    },
    openAi: {
      configured: Boolean(env.OPENAI_API_KEY),
      model: env.OPENAI_MODEL
    },
    aiRuntime: {
      mode: env.AI_RUNTIME_MODE,
      localEnabled: env.LOCAL_AI_ENABLED === "true",
      planEndpointEnabled: env.LOCAL_AI_PLAN_ENDPOINT_ENABLED === "true",
      localResponseGenerationEnabled: env.LOCAL_RESPONSE_GENERATION_ENABLED === "true",
      localEmbeddingsEnabled: env.LOCAL_EMBEDDINGS_ENABLED === "true",
      cloudFallbackEnabled: env.CLOUD_LLM_FALLBACK_ENABLED === "true",
      killSwitchActive: env.LOCAL_AI_KILL_SWITCH === "true",
      models: { ministral3b: env.LOCAL_AI_MODEL_3B_ENABLED === "true", ministral8b: env.LOCAL_AI_MODEL_8B_ENABLED === "true" }
    },
    email: {
      configured: Boolean(env.RESEND_API_KEY),
      fromConfigured: Boolean(env.NOTIFICATION_FROM_EMAIL)
    }
  });
});

healthRoutes.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      service: "backend-core",
      database: "ready",
      environment: deploymentInfo.environment,
      releaseSha: deploymentInfo.releaseSha,
      migrationVersion: deploymentInfo.migrationVersion,
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "backend-core",
      database: "unavailable",
      environment: deploymentInfo.environment,
      releaseSha: deploymentInfo.releaseSha,
      migrationVersion: deploymentInfo.migrationVersion,
      timestamp: new Date().toISOString()
    });
  }
});
