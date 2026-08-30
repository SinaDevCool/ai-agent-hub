import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActivityLog, ProviderReceipt } from "../api/types";
import {
  friendlyLogBadge,
  logMatchesCategory,
  logTone,
  providerReceiptBadge,
  providerReceiptDetail,
  providerReceiptTitle,
  providerReceiptTone
} from "../lib/appText";
import { StatusPill } from "./StatusPill";

export type ReceiptFilter = "all" | "approval" | "blocked" | "private_info" | "external";

const baseReceiptFilters: Array<{ id: ReceiptFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "approval", label: "Waiting" },
  { id: "blocked", label: "Stopped" },
  { id: "private_info", label: "Saved info" }
];

export type ReceiptEvent =
  | { type: "activity"; id: string; createdAt: string; log: ActivityLog }
  | { type: "provider"; id: string; createdAt: string; receipt: ProviderReceipt };

export function buildReceiptEvents(recentLogs: ActivityLog[], providerReceipts: ProviderReceipt[]) {
  return [
    ...recentLogs.map((log) => ({ type: "activity" as const, id: log.id, createdAt: log.createdAt, log })),
    ...providerReceipts.map((receipt) => ({ type: "provider" as const, id: receipt.id, createdAt: receipt.createdAt, receipt }))
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

export function filterReceiptEvents(events: ReceiptEvent[], activeFilter: ReceiptFilter) {
  return events.filter((event) => {
    if (activeFilter === "external") return event.type === "provider";
    if (activeFilter === "approval") {
      return event.type === "activity"
        ? logMatchesCategory(event.log, "approval")
        : event.receipt.status === "waiting_for_approval";
    }
    if (activeFilter === "blocked") {
      return event.type === "activity"
        ? logMatchesCategory(event.log, "blocked")
        : event.receipt.status === "blocked";
    }
    if (activeFilter === "private_info") return event.type === "activity" && logMatchesCategory(event.log, "private_info");
    return true;
  });
}

type ReceiptsPanelProps = {
  className: string;
  logsCount: number;
  providerReceipts: ProviderReceipt[];
  recentLogs: ActivityLog[];
  friendlyLogText: (log: ActivityLog) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyNotificationText: (log: ActivityLog) => string;
  friendlyDate: (value: string) => string;
  onUseAgent: () => void;
};

export function ReceiptsPanel(props: ReceiptsPanelProps) {
  const {
    className,
    logsCount,
    providerReceipts,
    recentLogs,
    friendlyLogText,
    friendlyLogDetail,
    friendlyNotificationText,
    friendlyDate,
    onUseAgent
  } = props;
  const [activeFilter, setActiveFilter] = useState<ReceiptFilter>("all");
  const receiptFilters = providerReceipts.length
    ? [...baseReceiptFilters, { id: "external" as const, label: "Connected apps" }]
    : baseReceiptFilters;
  const events = useMemo(() => buildReceiptEvents(recentLogs, providerReceipts), [providerReceipts, recentLogs]);
  const filteredEvents = useMemo(() => filterReceiptEvents(events, activeFilter), [activeFilter, events]);
  const groupedEvents = useMemo(() => filteredEvents.reduce<Array<{ label: string; events: ReceiptEvent[] }>>((groups, event) => {
    const label = friendlyDate(event.createdAt).split(",")[0] || friendlyDate(event.createdAt);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.events.push(event);
    else groups.push({ label, events: [event] });
    return groups;
  }, []), [filteredEvents, friendlyDate]);

  return (
    <div className={className} id="activity">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Activity & Receipts</div>
          <p className="mobile-section-intro">A clear history of what agents did, what they used, and what was stopped.</p>
        </div>
        <StatusPill tone="blue">{logsCount} events</StatusPill>
      </div>
      {events.length ? (
        <div className="receipt-filter-row" aria-label="Filter activity">
          {receiptFilters.map((filter) => (
            <button className={activeFilter === filter.id ? "selected" : ""} key={filter.id} onClick={() => setActiveFilter(filter.id)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
      {groupedEvents.map((group) => (
        <section className="receipt-day-group" key={group.label}>
          <h3>{group.label}</h3>
          {group.events.map((event) => {
            if (event.type === "provider") {
              const { receipt } = event;
              return (
                <div className={`log-row receipt-row receipt-provider receipt-${receipt.status}`} key={`provider-${receipt.id}`}>
                  <StatusPill tone={providerReceiptTone(receipt)}>{providerReceiptBadge(receipt)}</StatusPill>
                  <div>
                    <strong>{providerReceiptTitle(receipt)}</strong>
                    <span>{receipt.agentName} via {receipt.display?.externalService ?? receipt.providerLabel}</span>
                    <small>{providerReceiptDetail(receipt)}</small>
                  </div>
                  <time dateTime={receipt.createdAt}>{friendlyDate(receipt.createdAt)}</time>
                </div>
              );
            }
            const { log } = event;
            return (
              <div className={`log-row receipt-row receipt-${log.status}`} key={log.id}>
                <StatusPill tone={logTone(log)}>{friendlyLogBadge(log)}</StatusPill>
                <div>
                  <strong>{friendlyLogText(log)}</strong>
                  {friendlyNotificationText(log) ? <span>{friendlyNotificationText(log)}</span> : null}
                  <small>{friendlyLogDetail(log)}</small>
                </div>
                <time dateTime={log.createdAt}>{friendlyDate(log.createdAt)}</time>
              </div>
            );
          })}
        </section>
      ))}
      {events.length > 0 && filteredEvents.length === 0 ? (
        <div className="friendly-empty-state compact-empty-state">
          <strong>No activity in this view</strong>
          <p>Switch filters to see other agent activity.</p>
        </div>
      ) : null}
      {events.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No activity yet</strong>
          <p>When an agent uses saved info or waits for your approval, it will appear here.</p>
          <button onClick={onUseAgent} type="button"><MessageSquare size={16} /> Use an Agent</button>
        </div>
      ) : null}
    </div>
  );
}
