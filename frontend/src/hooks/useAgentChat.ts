import { type FormEvent, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import type { Agent, AgentConversation, AgentRunResult, HitlRequest, VaultDocument } from "../api/types";
import { friendlyActionName } from "../lib/display";

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

function friendlyChatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/internal server error|status 500|server/i.test(message)) return "The agent could not finish that request. Please try again in a moment.";
  if (/failed to fetch|network|connection/i.test(message)) return "The agent service is not reachable right now. Check the connection and try again.";
  if (/permission|access/i.test(message)) return "The agent needs your permission before it can continue.";
  return message || "The agent could not finish that request. Please try again.";
}

function displayUserMessage(content: string) {
  const match = content.match(/^Continue the approved action:\s*(.+)$/i);
  if (!match) return content;
  return `Continue approved action: ${friendlyActionName(match[1].trim())}`;
}

function displayAgentMessage(content: string, agentName: string) {
  const escapedAgentName = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const completedMatch = content.match(new RegExp(`^${escapedAgentName} completed the approved action:\\s*(.+)\\.$`, "i"));
  if (completedMatch) return `Approved action completed: ${friendlyActionName(completedMatch[1].trim())}.`;
  return content;
}

function chatItemFromMessage(message: AgentConversation["messages"][number], agentName = ""): ChatTranscriptItem {
  const metadata = message.metadata ?? {};
  const rawContent = message.content;
  return {
    role: message.role === "user" ? "user" : "agent",
    content: message.role === "user" ? displayUserMessage(rawContent) : displayAgentMessage(rawContent, agentName),
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
  const decidingApprovalRef = useRef("");

  function applyAgentRunResult(result: AgentRunResult) {
    setAgentRunResult(result);
    if (result.conversation) {
      setAgentConversation(result.conversation);
      setChatTranscript(
        result.conversation.messages
          .filter((message) => message.role === "user" || message.role === "agent")
          .map((message) => chatItemFromMessage(message, input.selectedAgent?.name ?? ""))
      );
    } else {
      setChatTranscript((current) => [...current, {
        role: "agent",
        content: displayAgentMessage(result.reply, input.selectedAgent?.name ?? ""),
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
  }

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
            .map((message) => chatItemFromMessage(message, input.selectedAgent?.name ?? ""))
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
    setChatTranscript((current) => [...current, { role: "user", content: displayUserMessage(cleanPrompt) }]);
    setChatInput("");
    setIsAgentRunning(true);
    setAgentRunResult(null);
    setLastFailedPrompt("");
    try {
      const result = await apiPost<AgentRunResult>(`/api/me/agents/${input.selectedAgent.id}/run`, { message: cleanPrompt });
      applyAgentRunResult(result);
      await input.refresh();
    } catch (error) {
      const message = friendlyChatError(error);
      setChatTranscript((current) => [...current, { role: "agent", content: message, status: "error" }]);
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
    if (decidingApprovalRef.current) return;
    decidingApprovalRef.current = id;
    setDecidingApprovalId(id);
    try {
      const { request } = await apiPost<{ request: HitlRequest }>(`/api/hitl/${id}/decision`, { approved });
      const approvedRequest = input.selectedAgentApprovals.find((request) => request.id === id);
      const message = approved ? "Allowed once. Continuing the approved action now." : "Denied. Nothing will continue.";
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
      if (approved) {
        const agentId = request.agent?.id ?? approvedRequest?.agent.id ?? input.selectedAgent?.id;
        if (!agentId) throw new Error("Approved, but the agent could not be found for continuation.");
        const continuation = await apiPost<AgentRunResult>(`/api/me/agents/${agentId}/run`, {
          message: `Continue the approved action: ${request.actionName}`
        });
        setApprovedContinuation((current) => current?.requestId === id ? null : current);
        if (input.selectedAgent?.id === agentId) {
          applyAgentRunResult(continuation);
        } else {
          input.setToolResult(continuation.reply);
        }
      }
      await input.refresh();
    } catch (error) {
      const message = friendlyChatError(error);
      input.setToolResult(message);
      setChatTranscript((current) => current.map((item) => item.requestId === id
        ? {
          ...item,
          status: "error",
          content: message,
          nextStep: "Try again. If this keeps happening, refresh and check whether the approval expired."
        }
        : item));
    } finally {
      decidingApprovalRef.current = "";
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
