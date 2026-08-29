import { decryptVaultField, encryptVaultField } from "./cryptoService.js";

type StoredVaultFields = {
  frontmatter: string;
  excerpt: string;
  embedding: string;
};

export function encryptVaultFields<T extends StoredVaultFields>(fields: T, userSalt: string): T {
  return {
    ...fields,
    frontmatter: encryptVaultField(fields.frontmatter, userSalt),
    excerpt: encryptVaultField(fields.excerpt, userSalt),
    embedding: encryptVaultField(fields.embedding, userSalt)
  };
}

export function decryptVaultFields<T extends StoredVaultFields>(fields: T, userSalt: string): T {
  return {
    ...fields,
    frontmatter: decryptVaultField(fields.frontmatter, userSalt),
    excerpt: decryptVaultField(fields.excerpt, userSalt),
    embedding: decryptVaultField(fields.embedding, userSalt)
  };
}
