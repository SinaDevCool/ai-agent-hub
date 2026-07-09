import { MessageSquare } from "lucide-react";
import type { ActivityLog } from "../api/types";
import { StatusPill } from "./StatusPill";

type ReceiptsPanelProps = {
  className: string;
  logsCount: number;
  recentLogs: ActivityLog[];
  friendlyLogText: (log: ActivityLog) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyNotificationText: (log: ActivityLog) => string;
  friendlyDate: (value: string) => string;
  onUseHelper: () => void;
};

export function ReceiptsPanel(props: ReceiptsPanelProps) {
  const {
    className,
    logsCount,
    recentLogs,
    friendlyLogText,
    friendlyLogDetail,
    friendlyNotificationText,
    friendlyDate,
    onUseHelper
  } = props;

  return (
    <div className={className} id="activity">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Receipts</div>
          <p className="mobile-section-intro">Every helper access, approval, and block appears here.</p>
        </div>
        <StatusPill tone="blue">{logsCount} events</StatusPill>
      </div>
      {recentLogs.map((log) => (
        <div className="log-row" key={log.id}>
          <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>
            {log.status === "success" ? "done" : log.status === "pending_human_approval" ? "needs approval" : "blocked"}
          </StatusPill>
          <span>{friendlyLogText(log)}</span>
          {friendlyNotificationText(log) ? <small>{friendlyNotificationText(log)}</small> : null}
          <small>{friendlyLogDetail(log)}</small>
          <small>{friendlyDate(log.createdAt)}</small>
        </div>
      ))}
      {recentLogs.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>Your safety log will appear here</strong>
          <p>When a helper reads private info, asks for approval, or gets blocked, you will see the receipt here.</p>
          <button onClick={onUseHelper} type="button"><MessageSquare size={16} /> Use a helper</button>
        </div>
      ) : null}
    </div>
  );
}
