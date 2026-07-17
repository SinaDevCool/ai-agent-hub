import { useMemo } from "react";
import type { ActivityLog, ProviderReceipt } from "../../api/types";
import {
  friendlyLogBadge,
  logTone,
  providerReceiptBadge,
  providerReceiptDetail,
  providerReceiptTitle,
  providerReceiptTone
} from "../../lib/appText";
import { StatusPill } from "../StatusPill";

type AgentActivityTabProps = {
  friendlyDate: (value: string) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyLogText: (log: ActivityLog) => string;
  selectedAgentLogs: ActivityLog[];
  selectedAgentProviderReceipts: ProviderReceipt[];
};

type AgentTimelineEvent =
  | { type: "activity"; id: string; createdAt: string; log: ActivityLog }
  | { type: "provider"; id: string; createdAt: string; receipt: ProviderReceipt };

export function AgentActivityTab(props: AgentActivityTabProps) {
  const { friendlyDate, friendlyLogDetail, friendlyLogText, selectedAgentLogs, selectedAgentProviderReceipts } = props;
  const timeline = useMemo<AgentTimelineEvent[]>(() => [
    ...selectedAgentLogs.map((log) => ({ type: "activity" as const, id: log.id, createdAt: log.createdAt, log })),
    ...selectedAgentProviderReceipts.map((receipt) => ({ type: "provider" as const, id: receipt.id, createdAt: receipt.createdAt, receipt }))
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()), [selectedAgentLogs, selectedAgentProviderReceipts]);

  return (
    <section className="agent-tab-panel" aria-label="Agent activity">
      <div className="panel-heading-row">
        <div>
          <strong>Activity for this agent</strong>
          <p className="mobile-section-intro">Every read, approval, and block appears here as a receipt.</p>
        </div>
        <StatusPill tone="blue">{timeline.length} events</StatusPill>
      </div>
      <div className="agent-activity-list">
        {timeline.length ? timeline.map((event) => (
          event.type === "provider" ? (
            <div className={`log-row receipt-provider receipt-${event.receipt.status}`} key={`provider-${event.id}`}>
              <StatusPill tone={providerReceiptTone(event.receipt)}>{providerReceiptBadge(event.receipt)}</StatusPill>
              <strong>{providerReceiptTitle(event.receipt)}</strong>
              <small>{providerReceiptDetail(event.receipt)}</small>
              <small>{friendlyDate(event.createdAt)}</small>
            </div>
          ) : (
            <div className="log-row" key={event.id}>
              <StatusPill tone={logTone(event.log)}>{friendlyLogBadge(event.log)}</StatusPill>
              <strong>{friendlyLogText(event.log)}</strong>
              <small>{friendlyLogDetail(event.log)}</small>
              <small>{friendlyDate(event.createdAt)}</small>
            </div>
          )
        )) : <p className="empty">No activity for this agent yet.</p>}
      </div>
    </section>
  );
}
