import type { ActivityLog } from "../../api/types";
import { StatusPill } from "../StatusPill";

type AgentActivityTabProps = {
  friendlyDate: (value: string) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyLogText: (log: ActivityLog) => string;
  selectedAgentLogs: ActivityLog[];
};

export function AgentActivityTab(props: AgentActivityTabProps) {
  const { friendlyDate, friendlyLogDetail, friendlyLogText, selectedAgentLogs } = props;

  return (
    <section className="agent-tab-panel" aria-label="Helper activity">
      <div className="panel-heading-row">
        <div>
          <strong>Activity for this helper</strong>
          <p className="mobile-section-intro">Every read, approval, and block appears here as a receipt.</p>
        </div>
        <StatusPill tone="blue">{selectedAgentLogs.length} events</StatusPill>
      </div>
      <div className="agent-activity-list">
        {selectedAgentLogs.length ? selectedAgentLogs.map((log) => (
          <div className="log-row" key={log.id}>
            <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>{log.status.replace(/_/g, " ")}</StatusPill>
            <strong>{friendlyLogText(log)}</strong>
            <small>{friendlyLogDetail(log)}</small>
            <small>{friendlyDate(log.createdAt)}</small>
          </div>
        )) : <p className="empty">No activity for this helper yet.</p>}
      </div>
    </section>
  );
}
