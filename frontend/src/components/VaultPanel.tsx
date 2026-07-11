import type { FormEvent } from "react";
import { useState } from "react";
import { FilePlus, FileSearch, Pencil, Search, Trash2, Upload } from "lucide-react";
import type { VaultDocument, VaultSchema } from "../api/types";
import { publicPrivateInfoSchemas } from "../lib/privateInfoDisplay";

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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [managedDocumentId, setManagedDocumentId] = useState("");
  const publicSchemas = publicPrivateInfoSchemas(schemas);
  const categorySummary = publicSchemas
    .map((schema) => ({
      id: schema.id,
      name: schema.name,
      count: documents.filter((document) => document.vaultSchema?.id === schema.id).length
    }))
    .filter((item) => item.count > 0)
    .slice(0, 6);

  return (
    <div className={className} id="vault">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Private Info</div>
          <p className="mobile-section-intro">Save useful details like preferences, rules, and notes. Agents can only use them when you allow it.</p>
        </div>
        <span className="status-pill blue">{documents.length} saved</span>
      </div>
      <div className="mobile-panel-actions">
        <button className="primary-action private-info-add-action" onClick={onToggleAddVaultItem} type="button"><FilePlus aria-hidden="true" size={16} /> Add info</button>
        <button aria-expanded={isMoreOpen} onClick={() => setIsMoreOpen((current) => !current)} type="button">More</button>
      </div>
      {isMoreOpen ? (
        <div className="private-info-more-panel">
          <label className="upload-button">
            <Upload aria-hidden="true" size={16} /> Upload file
            <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void onUploadVaultFile(event)} type="file" />
          </label>
          <button onClick={() => void onReindexVault()} type="button"><FileSearch aria-hidden="true" size={16} /> Refresh saved info</button>
        </div>
      ) : null}
      {isMoreOpen && categorySummary.length ? (
        <div className="vault-category-summary" aria-label="Private info by category">
          {categorySummary.map((item) => (
            <button key={item.id} onClick={() => setSearchSchemaId(item.id)} type="button">
              <strong>{item.count}</strong>
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      {documents.length ? (
        <form className="vault-search" onSubmit={(event) => void onSearchVault(event)}>
          <input
            aria-label="Search private info"
            name="private-info-search"
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search saved info…"
            required
            value={searchQuery}
          />
          <select aria-label="Filter private info category" onChange={(event) => setSearchSchemaId(event.currentTarget.value)} value={searchSchemaId}>
            <option value="">All categories</option>
            {publicSchemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
          </select>
          <button disabled={isSearchingVault} type="submit"><Search aria-hidden="true" size={16} /> {isSearchingVault ? "Searching…" : "Search info"}</button>
        </form>
      ) : null}
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
          <strong>No saved info yet</strong>
          <p>Add things an agent may need later: travel preferences, budget rules, application details, or family notes.</p>
          <div className="private-info-example-list" aria-label="Examples of saved info">
            <span>Travel preferences</span>
            <span>Budget rules</span>
            <span>Application details</span>
            <span>Family notes</span>
          </div>
          <button className="primary-action" onClick={onAddFirstVaultItem} type="button"><FilePlus aria-hidden="true" size={16} /> Add first info</button>
        </div>
      ) : null}
      {visibleDocuments.map((document) => (
        <article className="doc-row private-info-row" key={document.id}>
          <div>
            <strong>{document.title}</strong>
            <span>{document.vaultSchema?.name ?? "Uncategorized"}</span>
          </div>
          <p>{document.excerpt}</p>
          <button className="private-info-manage" aria-expanded={managedDocumentId === document.id} onClick={() => setManagedDocumentId((current) => current === document.id ? "" : document.id)} type="button">Manage</button>
          {managedDocumentId === document.id ? (
            <div className="button-row compact-row">
              <button onClick={() => onEditDocument(document)} type="button"><Pencil aria-hidden="true" size={15} /> Edit</button>
              <button className="danger" onClick={() => onDeleteDocument(document)} type="button"><Trash2 aria-hidden="true" size={15} /> Delete</button>
            </div>
          ) : null}
        </article>
      ))}
      {documents.length > visibleDocuments.length ? <p className="empty">Showing {visibleDocuments.length} of {documents.length} notes. Use search to find older notes.</p> : null}
    </div>
  );
}
