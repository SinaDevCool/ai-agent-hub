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

export function createSigningSecret() {
  return crypto.randomBytes(32).toString("base64url");
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

const connectorSalt = "ai-agent-hub-connector-tokens-v1";

export function encryptConnectorToken(plaintext: string) {
  return encryptForVault(plaintext, connectorSalt);
}

export function decryptConnectorToken(payload: string) {
  return decryptForVault(payload, connectorSalt);
}

const workflowSalt = "ai-agent-hub-workflow-secrets-v1";

export function encryptWorkflowSecret(plaintext: string) {
  return encryptForVault(plaintext, workflowSalt);
}

export function decryptWorkflowSecret(payload: string) {
  return decryptForVault(payload, workflowSalt);
}

const providerCredentialSalt = "ai-agent-hub-provider-credentials-v1";

export function encryptProviderCredentials(plaintext: string) {
  return encryptForVault(plaintext, providerCredentialSalt);
}

export function decryptProviderCredentials(payload: string) {
  return decryptForVault(payload, providerCredentialSalt);
}

export function fingerprintSecret(input: string) {
  return sha256(input).slice(0, 16);
}

export function signWorkflowPayload(input: { secret: string; timestamp: string; body: string }) {
  return crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
}

export function signConnectorState(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.VAULT_ENCRYPTION_KEY)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyConnectorState<T extends Record<string, unknown>>(state: string): T | null {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = crypto
    .createHmac("sha256", env.VAULT_ENCRYPTION_KEY)
    .update(encodedPayload)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
