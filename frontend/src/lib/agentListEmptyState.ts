import type { AgentStatusFilter } from "../hooks/useInstalledAgents";

type AgentListEmptyStateInput = {
  agentStatusFilter: AgentStatusFilter;
  agentSearch: string;
  hiddenTestAgentCount: number;
  hideTestAgents: boolean;
};

type AgentListEmptyState = {
  title: string;
  body: string;
  actionLabel: string;
};

export function agentListEmptyState(input: AgentListEmptyStateInput): AgentListEmptyState {
  const search = input.agentSearch.trim();

  if (search) {
    return {
      title: "No agents match that search",
      body: "Try a shorter name, task, or category.",
      actionLabel: "Clear search"
    };
  }

  if (input.agentStatusFilter === "ready") {
    return {
      title: "No ready agents yet",
      body: "Review access for one agent, then it will appear here.",
      actionLabel: "Show all agents"
    };
  }

  if (input.agentStatusFilter === "needs_access") {
    return {
      title: "No agents need access",
      body: "You are all set for this filter. Switch to All to see every agent.",
      actionLabel: "Show all agents"
    };
  }

  if (input.agentStatusFilter === "needs_approval") {
    return {
      title: "No agents are waiting",
      body: "Nothing needs your approval right now. Switch to All to keep using your agents.",
      actionLabel: "Show all agents"
    };
  }

  if (input.hideTestAgents && input.hiddenTestAgentCount) {
    return {
      title: "Only hidden test agents match",
      body: "Show hidden agents if you need to check old demo data.",
      actionLabel: "Show hidden agents"
    };
  }

  return {
    title: "No agents match this view",
    body: "Change the search or filters to see more agents.",
    actionLabel: "Show all agents"
  };
}
