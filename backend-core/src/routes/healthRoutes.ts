import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "backend-core",
    environment: env.NODE_ENV,
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
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "backend-core",
      database: "unavailable",
      timestamp: new Date().toISOString()
    });
  }
});
