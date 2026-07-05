import { Router } from "express";
import { env, resolvedVaultPath } from "../config/env.js";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "backend-core",
    environment: env.NODE_ENV,
    syncMode: env.SYNC_MODE,
    vaultPath: resolvedVaultPath
  });
});
