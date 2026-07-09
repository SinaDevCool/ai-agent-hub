import type { FormEvent } from "react";
import { FilePlus, FileSearch, Pencil, Search, Trash2, Upload } from "lucide-react";
import type { VaultDocument, VaultSchema } from "../api/types";

type VaultPanelProps = {
  className: string;
  schemas: VaultSchema[];
  documents: VaultDocument[];
  visibleDocuments: VaultDocument[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchSchemaId: string;
  setSearchSchemaId: (value: string) => void;
  searchResults: VaultDocument[];
  isSearchingVault: boolean;
  onToggleAddVaultItem: () => void;
  onAddFirstVaultItem: () => void;
  onUploadVaultFile: (event: FormEvent) => void | Promise<void>;
  onReindexVault: () => void | Promise<void>;
  onSearchVault: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onEditDocument: (document: VaultDocument) => void;
  onDeleteDocument: (document: VaultDocument) => void;
};

export function VaultPanel(props: VaultPanelProps) {
  const {
    className,
    schemas,
    documents,
    visibleDocuments,
    searchQuery,
    setSearchQuery,
    searchSchemaId,
    setSearchSchemaId,
    searchResults,
    isSearchingVault,
    onToggleAddVaultItem,
    onAddFirstVaultItem,
    onUploadVaultFile,
    onReindexVault,
    onSearchVault,
    onEditDocument,
    onDeleteDocument
  } = props;

  return (
    <div className={className} id="vault">
      <div className="panel-title">Private Info</div>
      <div className="mobile-panel-actions">
        <button onClick={onToggleAddVaultItem} type="button"><FilePlus size={16} /> Add Private Info</button>
        <label className="upload-button">
          <Upload size={16} /> Upload
          <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void onUploadVaultFile(event)} type="file" />
        </label>
        <button onClick={() => void onReindexVault()} type="button"><FileSearch size={16} /> Refresh Info</button>
      </div>
      <form className="vault-search" onSubmit={(event) => void onSearchVault(event)}>
        <input
          aria-label="Search private info"
          name="private-info-search"
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search personal info through the selected helper..."
          required
          value={searchQuery}
        />
        <select aria-label="Filter private info category" onChange={(event) => setSearchSchemaId(event.currentTarget.value)} value={searchSchemaId}>
          <option value="">All allowed categories</option>
          {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
        </select>
        <button disabled={isSearchingVault} type="submit"><Search size={16} /> {isSearchingVault ? "Searching..." : "Search Info"}</button>
      </form>
      {searchResults.length ? (
        <div className="search-results">
          <strong>Search results</strong>
          {searchResults.map((document) => (
            <article className="doc-row" key={`result-${document.id}`}>
              <strong>{document.title}</strong>
              <span>{document.vaultSchema?.name ?? "Uncategorized"}</span>
              <p>{document.excerpt}</p>
            </article>
          ))}
        </div>
      ) : null}
      {documents.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No private info yet</strong>
          <p>Save a note like travel preferences, payment rules, or household details. Helpers can only read it after you allow access.</p>
          <button onClick={onAddFirstVaultItem} type="button"><FilePlus size={16} /> Save your first note</button>
        </div>
      ) : null}
      {visibleDocuments.map((document) => (
        <article className="doc-row" key={document.id}>
          <strong>{document.title}</strong>
          <span>{document.vaultSchema?.name ?? "Uncategorized"}</span>
          <p>{document.excerpt}</p>
          <div className="button-row compact-row">
            <button onClick={() => onEditDocument(document)} type="button"><Pencil size={15} /> Edit</button>
            <button className="danger" onClick={() => onDeleteDocument(document)} type="button"><Trash2 size={15} /> Delete</button>
          </div>
        </article>
      ))}
      {documents.length > visibleDocuments.length ? <p className="empty">Showing {visibleDocuments.length} of {documents.length} notes. Use search to find older notes.</p> : null}
    </div>
  );
}
