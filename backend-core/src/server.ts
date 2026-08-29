import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./db/prisma.js";
import { realtimeHub } from "./services/realtimeHub.js";
import { startVaultWatcher, stopVaultWatcher } from "./services/vaultWatcherService.js";
import { migrateLegacyVaultEncryption } from "./services/vaultMigrationService.js";

const app = createApp();
const server = http.createServer(app);
realtimeHub.attach(server);

server.listen(env.PORT, () => {
  void (async () => {
    const migratedVaultDocuments = await migrateLegacyVaultEncryption();
    if (migratedVaultDocuments) logger.info({ migratedVaultDocuments }, "Encrypted legacy vault documents");
    if (env.NODE_ENV !== "production" && env.SYNC_MODE === "local") {
      const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
      if (user) startVaultWatcher(user.id);
    }
    logger.info({ port: env.PORT }, "AI Agent Hub backend-core listening");
  })().catch((error) => {
    logger.fatal({ error }, "Backend startup failed");
    server.close(() => process.exit(1));
  });
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down backend-core");
  await stopVaultWatcher();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
