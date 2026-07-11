import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActivityLog } from "../api/types";
import { StatusPill } from "./StatusPill";

type ReceiptFilter = "all" | "approval" | "blocked" | "private_info";

const receiptFilters: Array<{ id: ReceiptFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "approval", label: "Waiting" },
  { id: "blocked", label: "Stopped" },
  { id: "private_info", label: "Saved info" }
];

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
  const [activeFilter, setActiveFilter] = useState<ReceiptFilter>("all");
  const filteredLogs = useMemo(() => recentLogs.filter((log) => {
    if (activeFilter === "approval") return log.status === "pending_human_approval";
    if (activeFilter === "blocked") return log.status === "blocked_by_policy";
    if (activeFilter === "private_info") return friendlyLogText(log).toLowerCase().includes("saved info")
      || friendlyLogText(log).toLowerCase().includes("private")
      || friendlyLogDetail(log).toLowerCase().includes("saved info")
      || friendlyLogDetail(log).toLowerCase().includes("private")
      || friendlyLogDetail(log).toLowerCase().includes("read");
    return true;
  }), [activeFilter, friendlyLogDetail, friendlyLogText, recentLogs]);
  const groupedLogs = useMemo(() => filteredLogs.reduce<Array<{ label: string; logs: ActivityLog[] }>>((groups, log) => {
    const label = friendlyDate(log.createdAt).split(",")[0] || friendlyDate(log.createdAt);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.logs.push(log);
    else groups.push({ label, logs: [log] });
    return groups;
  }, []), [filteredLogs, friendlyDate]);

  return (
    <div className={className} id="activity">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Activity</div>
          <p className="mobile-section-intro">See when helpers used saved info, waited for you, or were stopped.</p>
        </div>
        <StatusPill tone="blue">{logsCount} events</StatusPill>
      </div>
      {recentLogs.length ? (
        <div className="receipt-filter-row" aria-label="Filter activity">
          {receiptFilters.map((filter) => (
            <button className={activeFilter === filter.id ? "selected" : ""} key={filter.id} onClick={() => setActiveFilter(filter.id)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
      {groupedLogs.map((group) => (
        <section className="receipt-day-group" key={group.label}>
          <h3>{group.label}</h3>
          {group.logs.map((log) => (
            <div className={`log-row receipt-row receipt-${log.status}`} key={log.id}>
              <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>
                {log.status === "success" ? "Done" : log.status === "pending_human_approval" ? "Waiting" : log.status === "error" ? "Problem" : "Stopped"}
              </StatusPill>
              <div>
                <strong>{friendlyLogText(log)}</strong>
                {friendlyNotificationText(log) ? <span>{friendlyNotificationText(log)}</span> : null}
                <small>{friendlyLogDetail(log)}</small>
              </div>
              <time dateTime={log.createdAt}>{friendlyDate(log.createdAt)}</time>
            </div>
          ))}
        </section>
      ))}
      {recentLogs.length > 0 && filteredLogs.length === 0 ? (
        <div className="friendly-empty-state compact-empty-state">
          <strong>No activity in this view</strong>
          <p>Switch filters to see other helper activity.</p>
        </div>
      ) : null}
      {recentLogs.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No activity yet</strong>
          <p>When a helper uses saved info or waits for your approval, it will appear here.</p>
          <button onClick={onUseHelper} type="button"><MessageSquare size={16} /> Use a helper</button>
        </div>
      ) : null}
    </div>
  );
}
