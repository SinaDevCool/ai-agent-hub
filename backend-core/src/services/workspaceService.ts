import { prisma } from "../db/prisma.js";
import { resolvedVaultPath } from "../config/env.js";
import path from "node:path";
import { createVaultSalt } from "./cryptoService.js";

export async function ensureUserWorkspace(input: { id: string; email: string }) {
  const userVaultPath = path.join(resolvedVaultPath, input.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
  return prisma.user.upsert({
    where: { id: input.id },
    update: { email: input.email, vaultLocalPath: userVaultPath },
    create: {
      id: input.id,
      email: input.email,
      vaultLocalPath: userVaultPath,
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}
