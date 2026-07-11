import { ApiError } from "../api/client";
import type { ActivityLog, AgentRunResult } from "../api/types";
import { externalLogDisplay } from "./externalRuntimeDisplay";
import { friendlyActionName } from "./display";

export function runtimeSummary(result: AgentRunResult | null) {
  if (!result) return null;
  if (result.externalRuntime?.proxyStatus === "executed") return "External agent answered through AI Agent Hub's safety proxy.";
  if (result.externalRuntime?.proxyStatus === "timed_out") return "The external agent took too long to respond.";
  if (result.externalRuntime?.proxyStatus === "failed") return "The external agent returned an error.";
  if (result.externalRuntime?.proxyStatus === "blocked") return "The external agent was blocked by a safety check.";
  if (result.runtimeState === "needs_permission") return "This agent needs permission before it can use that private info.";
  if (result.runtimeState === "needs_approval") return "Waiting for you. Nothing continues unless you allow it.";
  if (result.status === "blocked") return result.reason ?? "This request was blocked by your safety rules.";
  if (result.provider === "openai") return "Answered using your approved info.";
  if (result.provider === "local") return "Answered safely with the information available.";
  return "Answered safely.";
}

export function friendlyFallbackReason(reason?: string) {
  const labels: Record<string, string> = {
    auth_failed: "The OpenAI key could not be authenticated.",
    config_missing: "The full AI answer service is not connected yet.",
    model_not_found: "The selected OpenAI model was not found.",
    openai_request_failed: "The OpenAI request failed.",
    openai_server_error: "OpenAI had a temporary server issue.",
    project_or_model_access: "This OpenAI project does not have access to the selected model.",
    quota_or_rate_limit: "OpenAI quota or rate limits need attention."
  };
  if (!reason) return "The full AI answer service was unavailable.";
  if (reason.startsWith("openai_http_")) return "The full AI answer service returned an error.";
  return labels[reason] ?? "The full AI answer service was unavailable.";
}

export function getStarterInfoPlaceholder(templateId: string) {
  const placeholders: Record<string, string> = {
    travel: "Example: I prefer aisle seats, vegetarian meals, and hotels near public transit.",
    money: "Example: Ask me before purchases over 200 dollars. I prefer cash flow stability over rewards.",
    inbox: "Example: My usual tone is warm and brief. Never send email without my approval.",
    applications: "Example: I am applying to product roles. Draft first and never submit without my approval.",
    shopping: "Example: I prefer durable items, compare prices first, and ask me before any purchase.",
    health: "Example: Keep health notes private and ask before sharing anything with another service."
  };
  return placeholders[templateId] ?? "Add one useful preference or rule this agent should remember.";
}

export function friendlyLogText(log: ActivityLog) {
  const external = externalLogDisplay(log);
  if (external) return external.title;
  const agent = log.agent?.name ?? "An agent";
  if (log.actionType === "api_callback") return `${agent} contacted an external service`;
  if (log.actionType === "vault_read") return `${agent} used saved info`;
  if (log.actionType === "vault_write") return "Saved info changed";
  if (log.actionType === "permission_requested") return log.status === "success" ? `${agent} can use saved info` : `${agent} access changed`;
  if (log.actionType === "hitl_requested") return log.status === "pending_human_approval" ? `${agent} is waiting for you` : `${agent} waited for you`;
  if (log.actionType === "hitl_approved") return `${agent} was allowed once`;
  if (log.actionType === "hitl_denied") return "Nothing continued";
  if (log.actionType === "execution_triggered") return log.status === "blocked_by_policy" ? "Nothing continued" : `${agent} action updated`;
  if (log.actionType === "agent_created") return `${agent} added`;
  if (log.actionType === "agent_removed") return `${agent} removed`;
  if (log.actionType === "indexing_completed") return "Saved info indexed";
  return `${agent} activity`;
}

export function friendlyLogDetail(log: ActivityLog) {
  const external = externalLogDisplay(log);
  if (external) return external.detail || "Ran through AI Agent Hub safety";
  if (log.actionType === "vault_read") return `Used: ${log.dataAccessed ?? "approved saved info"}`;
  if (log.actionType === "permission_requested") return log.dataAccessed ? `Saved info: ${log.dataAccessed}` : "Saved info access changed";
  if (log.actionType === "hitl_requested") {
    if (log.status === "pending_human_approval") return "Nothing continues unless you allow it.";
    if (log.status === "blocked_by_policy") return "Denied. Nothing continued.";
    return log.dataAccessed ? `Paused: ${friendlyActionName(log.dataAccessed)}` : "A sensitive action paused.";
  }
  if (log.actionType === "hitl_approved") return log.dataAccessed ? `Allowed once: ${friendlyActionName(log.dataAccessed)}` : "Allowed once.";
  if (log.actionType === "hitl_denied") return log.dataAccessed ? `Denied: ${friendlyActionName(log.dataAccessed)}.` : "Denied. Nothing continued.";
  if (log.actionType === "execution_triggered" && log.status === "blocked_by_policy") return "Denied. Nothing continued.";
  if (log.actionType === "agent_created") return log.dataAccessed ? `Agent: ${log.dataAccessed}` : "Agent added to profile";
  if (log.actionType === "agent_removed") return log.dataAccessed ? `Agent: ${log.dataAccessed}` : "Agent removed from profile";
  if (log.dataAccessed) return friendlyActionName(log.dataAccessed);
  return "No extra detail";
}

export function friendlyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function friendlyNotificationText(log: ActivityLog) {
  if (log.actionType !== "hitl_requested") return "";
  const status = String(log.dynamicMetadata?.notificationStatus ?? "");
  if (status === "sent") return "Email notification sent";
  if (status === "skipped") return "Email notification not configured";
  if (status === "failed") return "Email notification failed";
  return "";
}

export function friendlyResult(result: Record<string, unknown>) {
  const status = String(result.status ?? "ok");
  if (status === "ok" && Array.isArray(result.documents)) return `Found ${result.documents.length} matching personal info item${result.documents.length === 1 ? "" : "s"}.`;
  if (status === "blocked") return `Blocked: ${String(result.reason ?? "this agent does not have permission.")}`;
  if (status === "awaiting_human_approval") return "Waiting for you. Nothing continues unless you allow it.";
  if (status === "vault_item_created") return "Personal info saved.";
  if (status === "vault_item_updated") return "Personal info updated.";
  if (status === "vault_item_deleted") return "Personal info deleted.";
  if (status === "vault_file_uploaded") return "File uploaded into Personal Info.";
  return status.replace(/_/g, " ");
}

export function friendlyAppError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.message && !/^request failed/i.test(error.message)) return error.message;
    if (error.status === 401) return "Your session expired. Please sign in again.";
    if (error.status === 403) return "You do not have permission to do that.";
    if (error.status === 404) return "We could not find that item.";
    if (error.status === 409) return "That change conflicts with something already saved.";
    if (error.status === 422 || error.status === 400) return "Check the details and try again.";
    if (error.status >= 500) return "We could not finish that request. Please try again in a moment.";
    return "We could not finish that request. Please try again.";
  }
  const message = error instanceof Error ? error.message : String(error || "");
  if (/openai|api key|quota|billing|model/i.test(message)) return "The AI answer service needs attention. Check the OpenAI key or account limits, then try again.";
  if (/supabase|auth|jwt|session/i.test(message)) return "Your sign-in session needs a refresh. Sign in again if this keeps happening.";
  if (/render|timeout|sleep|waking/i.test(message)) return "Your agent service may be waking up. Wait a few seconds and try again.";
  if (/failed to fetch|network|connection/i.test(message)) return "Could not reach your agent service. Check the connection, wait a few seconds, and try again.";
  return message || "We could not finish that request. Please try again.";
}
