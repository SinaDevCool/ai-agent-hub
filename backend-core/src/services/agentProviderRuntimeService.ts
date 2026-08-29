import type { RuntimeAgent, RuntimeBranchResult, RuntimeResult } from "./agentRuntimeTypes.js";
import type { getActiveImportedRuntimeProvider } from "./agentRuntimeActivationService.js";
import { executeConnector } from "./connectorExecutionService.js";
import { getProviderReceiptForToolRun } from "./providerReceiptService.js";
import { getWorkflowCapability, inferWorkflowCapability } from "./workflowCapabilityCatalog.js";
import { normalizeWorkflowFailure, type NormalizedWorkflowResult } from "./workflowResultNormalizer.js";

type ActiveImportedProvider = NonNullable<ReturnType<typeof getActiveImportedRuntimeProvider>>;

function shouldUseWorkflow(message: string, tools: Set<string>) {
  if (!tools.has("workflow.run")) return false;
  const capabilityKey = inferWorkflowCapability({ message });
  if (capabilityKey !== "general.research") return true;
  return /\b(workflow|research online|compare options|search online|find options|appointment|doctor|bank|budget|plumber|repair|shopping|restaurant|event|energy|device|wellness|fitness)\b/i.test(message);
}

function workflowReply(agent: RuntimeAgent, workflowResult: NormalizedWorkflowResult) {
  if (workflowResult.status === "failed") {
    return `${agent.name} could not finish ${workflowResult.receipt.capabilityLabel.toLowerCase()}. ${workflowResult.summary}`;
  }
  const count = workflowResult.items.length;
  const countText = count ? ` ${count} option${count === 1 ? "" : "s"}.` : "";
  return `${agent.name} used ${workflowResult.receipt.workflowName} and found results for ${workflowResult.receipt.capabilityLabel.toLowerCase()}.${countText}`;
}

export function structuredWorkflowInput(capabilityKey: string, message: string) {
  const input: Record<string, unknown> = { message };
  if (capabilityKey === "travel.search_hotels") {
    const destination = message.match(/\bin\s+([A-Z][A-Za-z\s-]{2,40})(?:\s|$)/)?.[1]?.trim();
    if (destination) input.destination = destination;
    if (/today/i.test(message)) input.checkInDate = "today";
    if (/tomorrow/i.test(message)) input.checkInDate = "tomorrow";
    if (/weekend/i.test(message)) {
      input.checkInDate = "next weekend";
      input.checkOutDate = "next weekend";
    }
    const guests = message.match(/\b(\d+)\s+(?:guest|guests|people|person|persons)\b/i)?.[1];
    if (guests) input.guests = Number(guests);
  }
  if (capabilityKey === "travel.search_flights") {
    const route = message.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:departing|leaving|on|returning|for)\b|$)/i);
    const departureDate = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    const passengers = message.match(/\b(\d+)\s+(?:passenger|passengers|adult|adults|person|people)\b/i)?.[1];
    if (route?.[1]) input.origin = route[1].trim();
    if (route?.[2]) input.destination = route[2].trim();
    if (departureDate) input.departureDate = departureDate;
    if (passengers) input.passengers = Number(passengers);
  }
  return input;
}

export async function runProviderRuntimeIntent(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  message: string;
  tools: Set<string>;
  activeImportedProvider: ActiveImportedProvider | null;
}): Promise<RuntimeBranchResult | null> {
  if (!shouldUseWorkflow(input.message, input.tools) && !input.activeImportedProvider) return null;

  const inferredCapabilityKey = inferWorkflowCapability({ message: input.message });
  const capabilityKey = input.activeImportedProvider && !input.activeImportedProvider.capabilities.includes(inferredCapabilityKey)
    ? input.activeImportedProvider.capabilities[0] ?? inferredCapabilityKey
    : inferredCapabilityKey;
  const capability = getWorkflowCapability(capabilityKey);
  const connectorResult = await executeConnector({
    userId: input.userId,
    agentId: input.agent.id,
    agentRunId: input.agentRunId,
    capabilityKey,
    input: structuredWorkflowInput(capabilityKey, input.message),
    preferredProviderId: input.activeImportedProvider?.providerId
  });

  if (connectorResult.status === "blocked") {
    const workflowResult = normalizeWorkflowFailure({
      reason: connectorResult.reason,
      capabilityKey
    });
    const providerReceipt = await getProviderReceiptForToolRun({
      userId: input.userId,
      toolRunId: connectorResult.toolRunId
    });
    const result: RuntimeResult = {
      status: "blocked",
      intent: "workflow",
      reply: workflowReply(input.agent, workflowResult),
      reason: connectorResult.reason,
      runtimeState: "blocked",
      nextStep: "Try again, or check the connected workflow in Settings.",
      provider: "workflow",
      workflowResult,
      providerReceipt
    };
    return {
      result,
      step: {
        title: capability ? `Run workflow: ${capability.label}` : "Run workflow",
        toolRunId: connectorResult.toolRunId,
        input: { message: input.message, capabilityKey },
        error: connectorResult.reason
      }
    };
  }

  if (connectorResult.status === "awaiting_human_approval") {
    const providerReceipt = await getProviderReceiptForToolRun({
      userId: input.userId,
      toolRunId: connectorResult.toolRunId
    });
    const result: RuntimeResult = {
      status: "awaiting_human_approval",
      intent: "workflow",
      reply: providerReceipt?.display.summary ?? `${input.agent.name} needs your approval before this workflow continues.`,
      runtimeState: "needs_approval",
      nextStep: "Approve or deny this request before the agent continues.",
      requestId: connectorResult.requestId,
      provider: "workflow",
      providerReceipt
    };
    return {
      result,
      step: {
        title: capability ? `Approve workflow: ${capability.label}` : "Approve workflow",
        toolRunId: connectorResult.toolRunId,
        input: { message: input.message, capabilityKey },
        output: { requestId: connectorResult.requestId }
      }
    };
  }

  const workflowResult = connectorResult.rawResult?.workflowResult as NormalizedWorkflowResult | undefined;
  const providerReceipt = await getProviderReceiptForToolRun({
    userId: input.userId,
    toolRunId: connectorResult.toolRunId
  });
  const result: RuntimeResult = {
    status: "ok",
    intent: "workflow",
    reply: workflowResult ? workflowReply(input.agent, workflowResult) : `${input.agent.name} completed the connected provider task.`,
    runtimeState: "ready",
    nextStep: "Review the workflow result and ask a follow-up if you want a narrower search.",
    provider: "workflow",
    workflowResult,
    providerReceipt
  };
  return {
    result,
    step: {
      title: capability ? `Run workflow: ${capability.label}` : "Run workflow",
      toolRunId: connectorResult.toolRunId,
      input: { message: input.message, capabilityKey },
      output: { connectorResult: connectorResult.result, rawResult: connectorResult.rawResult }
    }
  };
}
