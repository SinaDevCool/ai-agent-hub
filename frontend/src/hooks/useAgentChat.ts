import { type FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import type { Agent, AgentConversation, AgentRunResult, HitlRequest, VaultDocument } from "../api/types";

type AgentMessageStatus = "success" | "blocked_by_policy" | "pending_human_approval" | "error" | null;

export type AgentProfileTab = "chat" | "permissions" | "activity" | "settings";

export type ChatTranscriptItem = {
  role: "user" | "agent";
  content: string;
  status?: AgentRunResult["status"] | AgentMessageStatus;
  requestId?: string;
  actionName?: string;
  provider?: AgentRunResult["provider"];
  model?: string;
  providerFallbackReason?: AgentRunResult["providerFallbackReason"];
  runtimeState?: AgentRunResult["runtimeState"];
  nextStep?: string;
  usedSchemas?: string[];
  documents?: VaultDocument[];
  externalRuntime?: AgentRunResult["externalRuntime"];
};

function stringArrayFromMetadata(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function vaultDocumentsFromMetadata(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is VaultDocument => Boolean(item && typeof item === "object" && "id" in item)) : [];
}

function chatItemFromMessage(message: AgentConversation["messages"][number]): ChatTranscriptItem {
  const metadata = message.metadata ?? {};
  return {
    role: message.role === "user" ? "user" : "agent",
    content: message.content,
    status: typeof metadata.status === "string" ? metadata.status as AgentMessageStatus : null,
    requestId: typeof metadata.requestId === "string" ? metadata.requestId : undefined,
    actionName: typeof metadata.actionName === "string" ? metadata.actionName : undefined,
    provider: metadata.provider === "openai" || metadata.provider === "local" ? metadata.provider : undefined,
    model: typeof metadata.model === "string" ? metadata.model : undefined,
    providerFallbackReason: typeof metadata.providerFallbackReason === "string" ? metadata.providerFallbackReason : undefined,
    runtimeState: typeof metadata.runtimeState === "string" ? metadata.runtimeState as AgentRunResult["runtimeState"] : undefined,
    nextStep: typeof metadata.nextStep === "string" ? metadata.nextStep : undefined,
    usedSchemas: stringArrayFromMetadata(metadata.usedSchemas),
    documents: vaultDocumentsFromMetadata(metadata.documents)
  };
}

export function useAgentChat(input: {
  refresh: () => Promise<unknown>;
  selectedAgent: Agent | undefined;
  selectedAgentApprovals: HitlRequest[];
  setSearchResults: (documents: VaultDocument[]) => void;
  setToolResult: (message: string) => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [chatTranscript, setChatTranscript] = useState<ChatTranscriptItem[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentRunResult, setAgentRunResult] = useState<AgentRunResult | null>(null);
  const [agentConversation, setAgentConversation] = useState<AgentConversation | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState("");
  const [agentProfileTab, setAgentProfileTab] = useState<AgentProfileTab>("chat");
  const [approvedContinuation, setApprovedContinuation] = useState<{ requestId: string; actionName: string } | null>(null);
  const [decidingApprovalId, setDecidingApprovalId] = useState("");

  useEffect(() => {
    if (!input.selectedAgent?.id) {
      setAgentConversation(null);
      setChatTranscript([]);
      return;
    }
    let cancelled = false;
    setIsConversationLoading(true);
    setAgentRunResult(null);
    void apiGet<{ conversation: AgentConversation }>(`/api/me/agents/${input.selectedAgent.id}/conversation`)
      .then(({ conversation }) => {
        if (cancelled) return;
        setAgentConversation(conversation);
        setChatTranscript(
          conversation.messages
            .filter((message) => message.role === "user" || message.role === "agent")
            .map(chatItemFromMessage)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgentConversation(null);
        setChatTranscript([]);
      })
      .finally(() => {
        if (!cancelled) setIsConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.selectedAgent?.id]);

  async function submitAgentPrompt(prompt: string) {
    if (!input.selectedAgent || !prompt.trim()) return;
    const cleanPrompt = prompt.trim();
    setChatTranscript((current) => [...current, { role: "user", content: cleanPrompt }]);
    setChatInput("");
    setIsAgentRunning(true);
    setAgentRunResult(null);
    setLastFailedPrompt("");
    try {
      const result = await apiPost<AgentRunResult>(`/api/me/agents/${input.selectedAgent.id}/run`, { message: cleanPrompt });
      setAgentRunResult(result);
      if (result.conversation) {
        setAgentConversation(result.conversation);
        setChatTranscript(
          result.conversation.messages
            .filter((message) => message.role === "user" || message.role === "agent")
            .map(chatItemFromMessage)
        );
      } else {
        setChatTranscript((current) => [...current, {
          role: "agent",
          content: result.reply,
          status: result.status,
          requestId: result.requestId,
          actionName: result.actionName,
          provider: result.provider,
          model: result.model,
          providerFallbackReason: result.providerFallbackReason,
          runtimeState: result.runtimeState,
          nextStep: result.nextStep,
          usedSchemas: result.usedSchemas,
          documents: result.documents,
          externalRuntime: result.externalRuntime
        }]);
      }
      input.setToolResult(result.reply);
      if (result.documents?.length) input.setSearchResults(result.documents);
      await input.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed.";
      setChatTranscript((current) => [...current, { role: "agent", content: `Something went wrong. ${message}`, status: "error" }]);
      input.setToolResult(message);
      setLastFailedPrompt(cleanPrompt);
    } finally {
      setIsAgentRunning(false);
    }
  }

  async function runAgentChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAgentPrompt(chatInput);
  }

  async function decideHitl(id: string, approved: boolean) {
    setDecidingApprovalId(id);
    try {
      await apiPost(`/api/hitl/${id}/decision`, { approved });
      const approvedRequest = input.selectedAgentApprovals.find((request) => request.id === id);
      const message = approved ? "Allowed once. Nothing continues until you choose Continue action." : "Denied. Nothing will continue.";
      if (approved && approvedRequest) {
        setApprovedContinuation({ requestId: id, actionName: approvedRequest.actionName });
      } else if (!approved) {
        setApprovedContinuation((current) => current?.requestId === id ? null : current);
      }
      input.setToolResult(message);
      setAgentRunResult((current) => current?.requestId === id
        ? {
          ...current,
          status: approved ? "ok" : "blocked",
          runtimeState: approved ? "ready" : "blocked",
          nextStep: approved ? "Choose Continue action when you are ready." : "Denied. Nothing will continue.",
          reply: message
        }
        : current);
      setChatTranscript((current) => current.map((item) => item.requestId === id
        ? {
          ...item,
          status: approved ? "success" : "blocked_by_policy",
          content: message,
          nextStep: approved ? "Choose Continue action when you are ready." : "Denied. Nothing will continue.",
          actionName: item.actionName ?? approvedRequest?.actionName
        }
        : item));
      await input.refresh();
    } finally {
      setDecidingApprovalId("");
    }
  }

  async function continueApprovedAction(actionName: string) {
    await submitAgentPrompt(`Continue the approved action: ${actionName}`);
    setApprovedContinuation(null);
  }

  return {
    agentConversation,
    agentProfileTab,
    agentRunResult,
    approvedContinuation,
    chatInput,
    chatTranscript,
    continueApprovedAction,
    decideHitl,
    decidingApprovalId,
    isAgentRunning,
    isConversationLoading,
    lastFailedPrompt,
    runAgentChat,
    setAgentProfileTab,
    setChatInput,
    submitAgentPrompt
  };
}
