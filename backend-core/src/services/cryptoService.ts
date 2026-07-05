import crypto from "node:crypto";
import { env } from "../config/env.js";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function createAuditHash(input: unknown, previousHash?: string | null) {
  return sha256(JSON.stringify({ input, previousHash: previousHash ?? null }));
}

export function createVaultSalt() {
  return crypto.randomBytes(24).toString("hex");
}

export function encryptForVault(plaintext: string, salt: string) {
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(env.VAULT_ENCRYPTION_KEY, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptForVault(payload: string, salt: string) {
  const [ivRaw, tagRaw, textRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !textRaw) throw new Error("Invalid encrypted vault payload.");
  const key = crypto.scryptSync(env.VAULT_ENCRYPTION_KEY, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(textRaw, "base64")), decipher.final()]).toString("utf8");
}
