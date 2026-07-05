import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { requestContext } from "./middleware/requestContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { agentRoutes } from "./routes/agentRoutes.js";
import { vaultRoutes } from "./routes/vaultRoutes.js";
import { permissionRoutes } from "./routes/permissionRoutes.js";
import { activityRoutes } from "./routes/activityRoutes.js";
import { mcpRoutes } from "./routes/mcpRoutes.js";
import { hitlRoutes } from "./routes/hitlRoutes.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use(requestContext);

  app.use("/health", healthRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/vault", vaultRoutes);
  app.use("/api/permissions", permissionRoutes);
  app.use("/api/activity", activityRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/hitl", hitlRoutes);

  app.use(errorHandler);
  return app;
}
