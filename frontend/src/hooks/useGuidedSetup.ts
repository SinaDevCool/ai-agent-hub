import { type FormEvent, useMemo, useState } from "react";
import { apiPost } from "../api/client";
import type { Agent, VaultSchema } from "../api/types";
import type { RecentInstallSummary } from "../components/InstallSuccessPanel";
import type { AgentTemplate } from "./useAgentWizard";

function getStarterPrompt(templateId: string) {
  const prompts: Record<string, string> = {
    travel: "Plan a weekend trip using my preferences",
    money: "Find the spending rule I should follow",
    inbox: "Draft a polite follow-up email",
    applications: "Draft a resume summary for this job",
    shopping: "Compare options without buying anything",
    health: "Summarize the health note I saved"
  };
  return prompts[templateId] ?? "Find the personal info this helper can use";
}

function getAvailableAgentName(baseName: string, existingNames: string[], fallbackSuffix = "") {
  const normalized = new Set(existingNames.map((name) => name.toLowerCase()));
  const normalizedBase = baseName.toLowerCase();
  const relatedNameCount = existingNames.filter((name) => {
    const normalizedName = name.toLowerCase();
    return normalizedName === normalizedBase || normalizedName.startsWith(`${normalizedBase} `);
  }).length;
  if (relatedNameCount >= 20) return `${baseName} ${fallbackSuffix || Date.now().toString().slice(-6)}`;
  if (!normalized.has(baseName.toLowerCase())) return baseName;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!normalized.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseName} ${fallbackSuffix || Date.now().toString().slice(-6)}`;
}

export function useGuidedSetup(input: {
  agents: Agent[];
  agentTemplates: AgentTemplate[];
  formatError: (error: unknown) => string;
  refresh: () => Promise<unknown>;
  schemas: VaultSchema[];
  setActiveSection: (section: "clearance") => void;
  setChatInput: (value: string) => void;
  setIsAddingAgent: (value: boolean) => void;
  setIsAddingVaultItem: (value: boolean) => void;
  setRecentInstall: (install: RecentInstallSummary | null) => void;
  setSelectedAgentId: (agentId: string) => void;
  setToolResult: (message: string) => void;
}) {
  const [isGuidedSetupOpen, setIsGuidedSetupOpen] = useState(false);
  const [guidedSetupStep, setGuidedSetupStep] = useState(1);
  const [guidedTemplateId, setGuidedTemplateId] = useState("travel");
  const [guidedNameSuffix, setGuidedNameSuffix] = useState(() => Date.now().toString().slice(-6));
  const [guidedInfoText, setGuidedInfoText] = useState("");
  const [guidedSetupError, setGuidedSetupError] = useState("");
  const [isGuidedSetupSaving, setIsGuidedSetupSaving] = useState(false);

  const guidedTemplates = useMemo(
    () => input.agentTemplates.filter((template) => template.id !== "custom"),
    [input.agentTemplates]
  );
  const guidedTemplate = guidedTemplates.find((template) => template.id === guidedTemplateId) ?? guidedTemplates[0];
  const guidedAgentName = getAvailableAgentName(guidedTemplate.starterName, input.agents.map((agent) => agent.name), guidedNameSuffix);
  const guidedSchema = input.schemas.find((schema) => schema.name === guidedTemplate.requestedSchemas[0]);
  const guidedPrompt = getStarterPrompt(guidedTemplate.id);

  function openGuidedSetup(templateId = guidedTemplateId) {
    setGuidedTemplateId(templateId);
    setGuidedNameSuffix(Date.now().toString().slice(-6));
    setGuidedSetupStep(1);
    setGuidedInfoText("");
    setGuidedSetupError("");
    input.setIsAddingAgent(false);
    input.setIsAddingVaultItem(false);
    setIsGuidedSetupOpen(true);
    window.requestAnimationFrame(() => {
      document.querySelector(".guided-setup-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function completeGuidedSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuidedSetupError("");
    setIsGuidedSetupSaving(true);
    input.setActiveSection("clearance");
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: guidedAgentName,
        category: guidedTemplate.category,
        apiProtocol: "MCP",
        description: guidedTemplate.description,
        tools: guidedTemplate.tools,
        requestedSchemas: guidedTemplate.requestedSchemas,
        highRiskActions: guidedTemplate.highRiskActions
      });

      if (guidedInfoText.trim().length >= 10) {
        await apiPost("/api/vault/documents", {
          title: `${guidedTemplate.title} starter note`,
          vaultSchemaId: guidedSchema?.id ?? null,
          content: guidedInfoText.trim()
        });
      }

      await input.refresh();
      input.setSelectedAgentId(result.agent.id);
      input.setChatInput(guidedPrompt);
      input.setRecentInstall({
        agentId: result.agent.id,
        displayName: result.agent.name,
        category: result.agent.category,
        requestedSchemas: guidedTemplate.requestedSchemas,
        highRiskActions: guidedTemplate.highRiskActions,
        firstPrompt: guidedPrompt
      });
      input.setToolResult(`${result.agent.name} is ready. Review the requested info, then try: "${guidedPrompt}"`);
      setIsGuidedSetupOpen(false);
      setGuidedSetupStep(1);
      setGuidedInfoText("");
    } catch (error) {
      setGuidedSetupError(input.formatError(error));
    } finally {
      setIsGuidedSetupSaving(false);
    }
  }

  return {
    completeGuidedSetup,
    guidedAgentName,
    guidedInfoText,
    guidedPrompt,
    guidedSchema,
    guidedSetupError,
    guidedSetupStep,
    guidedTemplate,
    guidedTemplateId,
    guidedTemplates,
    isGuidedSetupOpen,
    isGuidedSetupSaving,
    openGuidedSetup,
    setGuidedInfoText,
    setGuidedSetupStep,
    setGuidedTemplateId,
    setIsGuidedSetupOpen
  };
}
