import { prisma } from "../db/prisma.js";
import { encryptVaultFields } from "./vaultCryptoService.js";

export async function migrateLegacyVaultEncryption() {
  const users = await prisma.user.findMany({ select: { id: true, vaultEncryptionSalt: true } });
  let migrated = 0;
  for (const user of users) {
    const documents = await prisma.vaultDocument.findMany({ where: { userId: user.id } });
    for (const document of documents) {
      if (document.frontmatter.startsWith("enc:v1:") && document.excerpt.startsWith("enc:v1:") && document.embedding.startsWith("enc:v1:")) continue;
      const encrypted = encryptVaultFields(document, user.vaultEncryptionSalt);
      await prisma.vaultDocument.update({
        where: { id: document.id },
        data: { frontmatter: encrypted.frontmatter, excerpt: encrypted.excerpt, embedding: encrypted.embedding }
      });
      migrated += 1;
    }
  }
  return migrated;
}
