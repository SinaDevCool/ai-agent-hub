import { apiPost } from "./client";
import type { ExternalAgentImportInput, ExternalAgentImportPreview, UserAgentInstall } from "./types";

export async function previewExternalAgentImport(input: ExternalAgentImportInput) {
  return apiPost<{ preview: ExternalAgentImportPreview }>("/api/external-agents/preview", input);
}

export async function importExternalAgent(input: ExternalAgentImportInput) {
  return apiPost<{ install: UserAgentInstall; preview: ExternalAgentImportPreview }>("/api/external-agents/import", input);
}
