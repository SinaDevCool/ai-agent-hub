import { prisma } from "../db/prisma.js";
import { parseVaultFile, listVaultMarkdownFiles } from "./vaultParserService.js";
import { embedText } from "./embeddingService.js";
import { writeActivityLog } from "./activityLogService.js";
import { realtimeHub } from "./realtimeHub.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { serializeVaultDocument } from "./serializerService.js";

export async function indexVaultFile(filePath: string, userId: string) {
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
  const data = {
      title: parsed.title,
      contentHash: parsed.contentHash,
      frontmatter: encodeJson(parsed.frontmatter),
      excerpt: parsed.excerpt,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector),
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
  realtimeHub.broadcast({ type: "vault.indexed", payload: serializeVaultDocument(document) });
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
  const docs = await prisma.vaultDocument.findMany({
    where: { userId, vaultSchemaId: schemaId },
    include: { vaultSchema: true }
  });
  return docs
    .map((doc) => {
      const vector = decodeJson<number[]>(doc.embedding, []);
      const score = cosineSimilarity(queryEmbedding.vector, vector);
      return { ...doc, score };
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
