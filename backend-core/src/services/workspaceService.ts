import { prisma } from "../db/prisma.js";
import { resolvedVaultPath } from "../config/env.js";
import { createVaultSalt } from "./cryptoService.js";

export async function ensureUserWorkspace(input: { id: string; email: string }) {
  return prisma.user.upsert({
    where: { id: input.id },
    update: { email: input.email, vaultLocalPath: resolvedVaultPath },
    create: {
      id: input.id,
      email: input.email,
      vaultLocalPath: resolvedVaultPath,
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}
