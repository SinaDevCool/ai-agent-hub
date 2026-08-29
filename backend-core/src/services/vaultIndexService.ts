import { prisma } from "../db/prisma.js";
import { parseVaultFile, listVaultMarkdownFiles } from "./vaultParserService.js";
import { embedText } from "./embeddingService.js";
import { writeActivityLog } from "./activityLogService.js";
import { realtimeHub } from "./realtimeHub.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { decryptVaultFields, encryptVaultFields } from "./vaultCryptoService.js";

export async function indexVaultFile(filePath: string, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const parsed = await parseVaultFile(filePath);
  if (!parsed) return null;
  const schema = parsed.schemaName
    ? await prisma.vaultSchema.findUnique({ where: { name: parsed.schemaName } })
    : null;
  const embedding = await embedText(`${parsed.title}\n${JSON.stringify(parsed.frontmatter)}\n${parsed.body}`);
  const existing = await prisma.vaultDocument.findFirst({
    where: { userId, relativePath: parsed.relativePath },
    select: { id: true }
  });
  const protectedFields = encryptVaultFields({
    frontmatter: encodeJson({ ...parsed.frontmatter, content: parsed.body }),
    excerpt: parsed.excerpt,
    embedding: encodeJson(embedding.vector)
  }, user.vaultEncryptionSalt);
  const data = {
      title: parsed.title,
      contentHash: parsed.contentHash,
      frontmatter: protectedFields.frontmatter,
      excerpt: protectedFields.excerpt,
      vectorProvider: embedding.provider,
      embedding: protectedFields.embedding,
      vaultSchemaId: schema?.id ?? null,
      indexedAt: new Date()
  };
  const document = existing
    ? await prisma.vaultDocument.update({ where: { id: existing.id }, data })
    : await prisma.vaultDocument.create({
      data: {
      userId,
      relativePath: parsed.relativePath,
      ...data
    }
  });
  realtimeHub.broadcastToUser(userId, {
    type: "vault.indexed",
    payload: { id: document.id, title: document.title, indexedAt: document.indexedAt }
  });
  await writeActivityLog({
    userId,
    actionType: "indexing_completed",
    status: "success",
    dataAccessed: parsed.relativePath,
    dynamicMetadata: { schema: parsed.schemaName ?? null, provider: embedding.provider }
  });
  return document;
}

export async function reindexVault(userId: string) {
  const files = await listVaultMarkdownFiles();
  const indexed = [];
  for (const file of files) {
    const document = await indexVaultFile(file, userId);
    if (document) indexed.push(document);
  }
  return indexed;
}

export async function searchVaultDocuments(userId: string, query: string, schemaId?: string) {
  const queryEmbedding = await embedText(query);
  const [user, docs] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: userId } }), prisma.vaultDocument.findMany({
    where: { userId, vaultSchemaId: schemaId },
    include: { vaultSchema: true }
  })]);
  return docs
    .map((doc) => {
      const decrypted = decryptVaultFields(doc, user.vaultEncryptionSalt);
      const vector = decodeJson<number[]>(decrypted.embedding, []);
      const score = cosineSimilarity(queryEmbedding.vector, vector);
      return { ...decrypted, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMag += a[index] ** 2;
    bMag += b[index] ** 2;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag) || 1);
}
