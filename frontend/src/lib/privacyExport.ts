import type { ActivityLog, Agent, VaultDocument } from "../api/types";
import { friendlyActionName, friendlyToolName } from "./display";
import { friendlyLogText } from "./appText";

export function buildPrivacyExportPayload(input: {
  account: string;
  agents: Agent[];
  documents: VaultDocument[];
  logs: ActivityLog[];
}) {
  return {
    account: input.account,
    agents: input.agents.map((agent) => ({
      name: agent.name,
      category: agent.category,
      canUse: agent.capabilityManifest.tools?.map(friendlyToolName) ?? [],
      canRead: agent.capabilityManifest.requestedSchemas ?? [],
      mustAskBefore: agent.capabilityManifest.highRiskActions?.map(friendlyActionName) ?? []
    })),
    personalInfo: input.documents.map((document) => ({
      title: document.title,
      category: document.vaultSchema?.name ?? "Uncategorized",
      summary: document.excerpt
    })),
    recentActivity: input.logs.slice(0, 20).map((log) => ({
      when: log.createdAt,
      status: log.status,
      event: friendlyLogText(log),
      detail: log.dataAccessed
    }))
  };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new window.Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
