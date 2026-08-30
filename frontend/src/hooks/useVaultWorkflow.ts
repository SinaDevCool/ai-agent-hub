import { type FormEvent, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type { Agent, VaultDocument, VaultSchema } from "../api/types";

type VaultItemDraft = {
  title: string;
  vaultSchemaId: string;
  content: string;
};

type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
  onConfirm: () => Promise<void> | void;
};

const initialVaultItemDraft: VaultItemDraft = {
  title: "",
  vaultSchemaId: "",
  content: ""
};

export function useVaultWorkflow(input: {
  formatError: (error: unknown) => string;
  friendlyResult: (result: Record<string, unknown>) => string;
  refresh: () => Promise<unknown>;
  schemas: VaultSchema[];
  scrollToSection: (section: "vault") => void;
  selectedAgent: Agent | undefined;
  setConfirmation: (confirmation: ConfirmationDialog) => void;
  setToolResult: (message: string) => void;
}) {
  const [isAddingVaultItem, setIsAddingVaultItem] = useState(false);
  const [vaultItemDraft, setVaultItemDraft] = useState<VaultItemDraft>(initialVaultItemDraft);
  const [isCreatingVaultItem, setIsCreatingVaultItem] = useState(false);
  const [createVaultItemError, setCreateVaultItemError] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSchemaId, setSearchSchemaId] = useState("");
  const [searchResults, setSearchResults] = useState<VaultDocument[]>([]);
  const [isSearchingVault, setIsSearchingVault] = useState(false);

  function updateVaultItemDraft(patch: Partial<VaultItemDraft>) {
    setVaultItemDraft((current) => ({ ...current, ...patch }));
  }

  function cancelVaultItemEdit() {
    setIsAddingVaultItem(false);
    setEditingDocumentId("");
    setVaultItemDraft(initialVaultItemDraft);
  }

  async function runVaultSearch() {
    if (!input.selectedAgent) return;
    const requestedSchema = input.selectedAgent.capabilityManifest.requestedSchemas?.[0];
    const query = requestedSchema
      ? `${requestedSchema} notes and preferences`
      : `${input.selectedAgent.category} preferences and saved info`;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: input.selectedAgent.id,
      toolName: "vault.search",
      arguments: { query, schema: requestedSchema }
    });
    const documents = (result as { documents?: VaultDocument[] }).documents;
    if (documents) setSearchResults(documents);
    input.setToolResult(input.friendlyResult(result as Record<string, unknown>));
    await input.refresh();
  }

  async function reindexVault() {
    await apiPost("/api/vault/reindex");
    input.setToolResult("Personal info refreshed and indexed.");
    await input.refresh();
  }

  async function searchVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearchingVault(true);
    try {
      const parameters = new URLSearchParams({ q: searchQuery });
      if (searchSchemaId) parameters.set("schemaId", searchSchemaId);
      const result = await apiGet<{ results: VaultDocument[] }>(`/api/vault/search?${parameters.toString()}`);
      setSearchResults(result.results);
      input.setToolResult(result.results.length
        ? `Found ${result.results.length} saved ${result.results.length === 1 ? "item" : "items"}.`
        : "No saved information matched that search.");
    } finally {
      setIsSearchingVault(false);
    }
  }

  async function createVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setIsAddingVaultItem(false);
      input.setToolResult(`${result.document.title} was saved to Personal Info.`);
      await input.refresh();
      input.scrollToSection("vault");
    } catch (error) {
      setCreateVaultItemError(input.formatError(error));
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  async function saveVaultEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocumentId) return;
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPut<{ document: VaultDocument }>(`/api/vault/documents/${editingDocumentId}`, {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setEditingDocumentId("");
      setIsAddingVaultItem(false);
      input.setToolResult(`${result.document.title} was updated.`);
      await input.refresh();
    } catch (error) {
      setCreateVaultItemError(input.formatError(error));
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  function beginEditVaultItem(document: VaultDocument) {
    setEditingDocumentId(document.id);
    setVaultItemDraft({
      title: document.title,
      vaultSchemaId: document.vaultSchema?.id ?? "",
      content: String(document.frontmatter.content ?? document.excerpt)
    });
    setIsAddingVaultItem(true);
    input.scrollToSection("vault");
  }

  function deleteVaultItem(document: VaultDocument) {
    input.setConfirmation({
      title: "Delete private info?",
      message: `Delete "${document.title}"? Your agents will no longer be able to use this note.`,
      confirmLabel: "Delete note",
      tone: "danger",
      onConfirm: async () => {
        await apiDelete(`/api/vault/documents/${document.id}`);
        input.setToolResult(`${document.title} was deleted from Private Info.`);
        await input.refresh();
      }
    });
  }

  async function uploadVaultFile(event: FormEvent) {
    const fileInput = event.currentTarget as unknown as {
      files?: { [index: number]: { name: string; text: () => Promise<string> } | undefined };
      value: string;
    };
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (!/(\.txt|\.md)$/i.test(file.name)) {
      input.setToolResult("Upload blocked: this MVP supports .txt and .md files.");
      return;
    }
    const content = await file.text();
    const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
      title: file.name.replace(/\.(txt|md)$/i, ""),
      vaultSchemaId: searchSchemaId || null,
      content
    });
    input.setToolResult(`${result.document.title} was uploaded to Personal Info.`);
    await input.refresh();
    input.scrollToSection("vault");
  }

  return {
    beginEditVaultItem,
    cancelVaultItemEdit,
    createVaultItem,
    createVaultItemError,
    deleteVaultItem,
    editingDocumentId,
    isAddingVaultItem,
    isCreatingVaultItem,
    isSearchingVault,
    reindexVault,
    runVaultSearch,
    saveVaultEdit,
    searchQuery,
    searchResults,
    searchSchemaId,
    searchVault,
    setIsAddingVaultItem,
    setSearchQuery,
    setSearchResults,
    setSearchSchemaId,
    updateVaultItemDraft,
    uploadVaultFile,
    vaultItemDraft
  };
}
