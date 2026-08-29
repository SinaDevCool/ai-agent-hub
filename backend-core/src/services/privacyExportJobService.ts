import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { encryptForVault } from "./cryptoService.js";
import { registerDurableJobHandler } from "./durableJobService.js";

const payloadSchema = z.object({ requestId: z.string().min(1) });

export function buildPrivacyExport(input: { user: { id: string; email: string; createdAt: Date }; requests: unknown[]; installs: unknown[]; permissions: unknown[]; documents: unknown[]; activity: unknown[]; connections: unknown[]; transactions: unknown[] }, generatedAt = new Date()) {
  return { schemaVersion: "privacy-export.v1", generatedAt: generatedAt.toISOString(), account: input.user, installedAgents: input.installs, permissions: input.permissions, vaultDocuments: input.documents, activity: input.activity, connectedAccounts: input.connections, lifeTransactions: input.transactions, dataRightsRequests: input.requests };
}

async function executePrivacyExport(requestId: string) {
  const request = await prisma.dataRightsRequest.findUnique({ where: { id: requestId } });
  if (!request || request.requestType !== "export" || !["pending", "scheduled", "processing"].includes(request.status)) return { outcome: "permanent" as const, message: "Export request is unavailable." };
  await prisma.dataRightsRequest.update({ where: { id: request.id }, data: { status: "processing" } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId }, select: { id: true, email: true, createdAt: true, vaultEncryptionSalt: true } });
  const [requests, installs, permissions, documents, activity, connections, transactions] = await Promise.all([
    prisma.dataRightsRequest.findMany({ where: { userId: user.id } }), prisma.userAgentInstall.findMany({ where: { userId: user.id } }), prisma.agentPermission.findMany({ where: { userId: user.id } }), prisma.vaultDocument.findMany({ where: { userId: user.id }, select: { id: true, title: true, relativePath: true, frontmatter: true, excerpt: true, indexedAt: true } }), prisma.activityLog.findMany({ where: { userId: user.id } }), prisma.connectedAccount.findMany({ where: { userId: user.id }, select: { id: true, provider: true, accountLabel: true, scopes: true, status: true, createdAt: true, updatedAt: true } }), prisma.lifeTransaction.findMany({ where: { userId: user.id } })
  ]);
  const exportValue = buildPrivacyExport({ user: { id: user.id, email: user.email, createdAt: user.createdAt }, requests, installs, permissions, documents, activity, connections, transactions });
  const artifactId = randomUUID();
  const directory = path.resolve(process.cwd(), env.PRIVACY_EXPORT_PATH);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${artifactId}.enc`), encryptForVault(JSON.stringify(exportValue), user.vaultEncryptionSalt), { encoding: "utf8", flag: "wx", mode: 0o600 });
  const completedAt = new Date();
  await prisma.dataRightsRequest.update({ where: { id: request.id }, data: { status: "completed", completedAt, artifactRef: artifactId, artifactExpiresAt: new Date(completedAt.getTime() + env.PRIVACY_EXPORT_TTL_HOURS * 3_600_000) } });
  return { outcome: "succeeded" as const };
}

export function registerPrivacyExportJobHandler() {
  if (env.PRIVACY_EXPORT_EXECUTOR_ENABLED !== "true") return false;
  registerDurableJobHandler("privacy_export", { version: 1, schema: payloadSchema, execute: async ({ payload }) => executePrivacyExport(payloadSchema.parse(payload).requestId) });
  return true;
}
