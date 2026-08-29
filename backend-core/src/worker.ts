import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { disconnectPrisma } from "./db/prisma.js";
import { processDurableJobBatch } from "./services/durableJobService.js";
import { registerPrivacyExportJobHandler } from "./services/privacyExportJobService.js";
import { registerCalComWebhookJobHandler } from "./services/calComWebhookService.js";
import { registerPlaidJobHandlers } from "./services/plaidWebhookService.js";

const workerId = `durable-worker:${randomUUID()}`;
registerPrivacyExportJobHandler();
registerCalComWebhookJobHandler();
registerPlaidJobHandlers();
let stopping = false;

async function run() {
  if (env.DURABLE_JOBS_ENABLED !== "true") {
    logger.info({ workerId }, "Durable job worker is disabled");
    return;
  }
  logger.info({ workerId }, "Durable job worker started");
  while (!stopping) {
    const result = await processDurableJobBatch(workerId).catch((error) => {
      logger.error({ error, workerId }, "Durable job batch failed");
      return { enabled: true, claimed: 0 };
    });
    if (!result.claimed) await new Promise((resolve) => setTimeout(resolve, env.DURABLE_JOB_POLL_MS));
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal, workerId }, "Durable job worker stopping after current batch");
  await disconnectPrisma();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void run().then(async () => {
  if (!stopping) await disconnectPrisma();
}).catch(async (error) => {
  logger.fatal({ error, workerId }, "Durable job worker failed");
  await disconnectPrisma();
  process.exitCode = 1;
});
