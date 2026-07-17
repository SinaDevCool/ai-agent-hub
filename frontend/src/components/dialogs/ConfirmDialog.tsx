export type ConfirmDialogModel = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
};

export function ConfirmDialog(props: {
  confirmation: ConfirmDialogModel;
  error?: string;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <section aria-describedby="confirm-dialog-copy" aria-labelledby="confirm-dialog-title" aria-modal="true" className="confirm-dialog" role="dialog">
        <div className="panel-title">Please Confirm</div>
        <h2 id="confirm-dialog-title">{props.confirmation.title}</h2>
        <p id="confirm-dialog-copy">{props.confirmation.message}</p>
        {props.error ? <p className="confirm-dialog-error" role="alert">{props.error}</p> : null}
        <div className="button-row">
          <button
            className={props.confirmation.tone === "danger" ? "danger" : ""}
            disabled={props.isConfirming}
            onClick={props.onConfirm}
            type="button"
          >
            {props.isConfirming ? "Working…" : props.confirmation.confirmLabel}
          </button>
          <button disabled={props.isConfirming} onClick={props.onCancel} type="button">Cancel</button>
        </div>
      </section>
    </div>
  );
}
