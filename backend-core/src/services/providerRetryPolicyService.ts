import type { ConnectorAction } from "./connectorCapabilityService.js";
import type { ToolExecutionResult } from "./tools/toolExecutionTypes.js";

export type ProviderRetryDecision =
  | { retry: true; reason: string; nextAttempt: number }
  | { retry: false; reason: string };

export function shouldRetryProviderResult(input: {
  result: ToolExecutionResult;
  action: ConnectorAction;
  attempt: number;
  maxAttempts?: number;
  approvalRequired?: boolean;
}): ProviderRetryDecision {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  if (input.result.status !== "blocked") return { retry: false, reason: "Only blocked provider results can be retried." };
  if (input.action === "execute_action") return { retry: false, reason: "Provider actions that execute real-world changes are never retried automatically." };
  if (input.approvalRequired) return { retry: false, reason: "Approval-required provider work is never retried automatically." };
  if (input.attempt >= maxAttempts) return { retry: false, reason: "Retry limit reached." };
  if (!input.result.retryable) return { retry: false, reason: "Provider result is not retryable." };
  if (input.result.nextAction && input.result.nextAction !== "try_again") {
    return { retry: false, reason: `Provider result requires ${input.result.nextAction}.` };
  }
  if (input.result.code && !["provider_unavailable", "provider_error", "execution_failed"].includes(input.result.code)) {
    return { retry: false, reason: `${input.result.code} is not safe to retry automatically.` };
  }
  return { retry: true, reason: "Retryable provider failure.", nextAttempt: input.attempt + 1 };
}

export function connectorAttemptIdempotencyKey(input: {
  baseKey?: string;
  attempt: number;
}) {
  if (!input.baseKey) return undefined;
  return input.attempt <= 1 ? input.baseKey : `${input.baseKey}:provider-retry:${input.attempt}`;
}
