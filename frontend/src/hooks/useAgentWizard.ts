import { type FormEvent, useState } from "react";
import { apiPost } from "../api/client";
import type { Agent } from "../api/types";

export type AgentDraft = {
  name: string;
  category: string;
  apiProtocol: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActionsText: string;
};

export type AgentTemplate = {
  id: string;
  title: string;
  category: string;
  starterName: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActions: string[];
  summary: string;
};

export const initialAgentDraft: AgentDraft = {
  name: "",
  category: "Custom",
  apiProtocol: "MCP",
  description: "",
  tools: ["vault.search"],
  requestedSchemas: [],
  highRiskActionsText: ""
};

export function parseHighRiskActions(value: string) {
  return value.split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function useAgentWizard(input: {
  agentTemplates: AgentTemplate[];
  formatError: (error: unknown) => string;
  refresh: () => Promise<unknown>;
  scrollToSection: (section: "helpers") => void;
  setSelectedAgentId: (agentId: string | ((current: string) => string)) => void;
  setToolResult: (message: string) => void;
}) {
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [agentWizardStep, setAgentWizardStep] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState("travel");
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(initialAgentDraft);
  const [createAgentError, setCreateAgentError] = useState("");
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

  function updateAgentDraft(patch: Partial<AgentDraft>) {
    setAgentDraft((current) => ({ ...current, ...patch }));
  }

  function applyAgentTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    setAgentDraft({
      name: template.starterName,
      category: template.category,
      apiProtocol: "MCP",
      description: template.description,
      tools: template.tools,
      requestedSchemas: template.requestedSchemas,
      highRiskActionsText: template.highRiskActions.join(", ")
    });
  }

  function openAgentWizard() {
    const template = input.agentTemplates.find((item) => item.id === selectedTemplateId) ?? input.agentTemplates[0];
    applyAgentTemplate(template);
    setCreateAgentError("");
    setAgentWizardStep(1);
    setIsAddingAgent(true);
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAgentError("");
    setIsCreatingAgent(true);
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: agentDraft.name,
        category: agentDraft.category,
        apiProtocol: agentDraft.apiProtocol,
        description: agentDraft.description,
        tools: agentDraft.tools,
        requestedSchemas: agentDraft.requestedSchemas,
        highRiskActions: parseHighRiskActions(agentDraft.highRiskActionsText)
      });
      setAgentDraft(initialAgentDraft);
      setIsAddingAgent(false);
      input.setSelectedAgentId(result.agent.id);
      input.setToolResult(`${result.agent.name} was added. Review its permissions before granting access.`);
      await input.refresh();
      input.setSelectedAgentId(result.agent.id);
      input.scrollToSection("helpers");
    } catch (error) {
      setCreateAgentError(input.formatError(error));
    } finally {
      setIsCreatingAgent(false);
    }
  }

  return {
    agentDraft,
    agentWizardStep,
    applyAgentTemplate,
    createAgent,
    createAgentError,
    isAddingAgent,
    isCreatingAgent,
    openAgentWizard,
    selectedTemplateId,
    setAgentWizardStep,
    setIsAddingAgent,
    updateAgentDraft
  };
}
