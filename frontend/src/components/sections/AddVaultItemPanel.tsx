import type { FormEvent } from "react";
import { FilePlus } from "lucide-react";
import type { VaultSchema } from "../../api/types";
import { publicPrivateInfoSchemas } from "../../lib/privateInfoDisplay";
import type { VaultItemDraft } from "./WorkspaceSections.types";

type AddVaultItemPanelProps = {
  cancelVaultItemEdit: () => void;
  createVaultItem: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  createVaultItemError: string;
  editingDocumentId: string;
  isCreatingVaultItem: boolean;
  saveVaultEdit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  schemas: VaultSchema[];
  updateVaultItemDraft: (update: Partial<VaultItemDraft>) => void;
  vaultItemDraft: VaultItemDraft;
};

export function AddVaultItemPanel(props: AddVaultItemPanelProps) {
  const {
    cancelVaultItemEdit,
    createVaultItem,
    createVaultItemError,
    editingDocumentId,
    isCreatingVaultItem,
    saveVaultEdit,
    schemas,
    updateVaultItemDraft,
    vaultItemDraft
  } = props;
  const publicSchemas = publicPrivateInfoSchemas(schemas);

  return (
    <form className="panel add-vault-panel" onSubmit={(event) => editingDocumentId ? void saveVaultEdit(event) : void createVaultItem(event)}>
      <div className="panel-title">{editingDocumentId ? "Edit Info" : "Add Info"}</div>
      <div className="form-grid vault-form-grid">
        <label>
          <span>Name this info</span>
          <input
            maxLength={120}
            name="private-info-title"
            onChange={(event) => updateVaultItemDraft({ title: event.currentTarget.value })}
            placeholder="Travel preferences"
            required
            value={vaultItemDraft.title}
          />
        </label>
        <label>
          <span>What kind of info is it?</span>
          <select
            name="private-info-category"
            onChange={(event) => updateVaultItemDraft({ vaultSchemaId: event.currentTarget.value })}
            value={vaultItemDraft.vaultSchemaId}
          >
            <option value="">Uncategorized</option>
            {publicSchemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
          </select>
        </label>
        <label className="wide-field">
          <span>Details</span>
          <textarea
            maxLength={5000}
            minLength={10}
            name="private-info-note"
            onChange={(event) => updateVaultItemDraft({ content: event.currentTarget.value })}
            placeholder="Example: I prefer aisle seats, vegetarian meals, and hotels near public transit."
            required
            rows={4}
            value={vaultItemDraft.content}
          />
        </label>
      </div>
      {createVaultItemError ? <p className="error-text">{createVaultItemError}</p> : null}
      <div className="button-row">
        <button disabled={isCreatingVaultItem} type="submit">
          <FilePlus aria-hidden="true" size={16} /> {isCreatingVaultItem ? "Saving…" : editingDocumentId ? "Update info" : "Save info"}
        </button>
        <button onClick={() => {
          cancelVaultItemEdit();
        }} type="button">Cancel</button>
      </div>
    </form>
  );
}
