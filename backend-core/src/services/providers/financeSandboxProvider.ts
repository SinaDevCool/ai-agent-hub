import { createHash, randomUUID } from "node:crypto";
import { getLifeCapability, lifeProviders } from "../lifePlatformCatalog.js";
import { lifeProviderActionContract } from "./lifeProviderActionContractService.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

const catalogProvider = lifeProviders.find((provider) => provider.id === "finance-sandbox");
if (!catalogProvider) throw new Error("Finance sandbox catalog entry is missing.");
function runId(input: ProviderExecutionInput) { return input.previousToolRunId ?? `finance-sandbox-${randomUUID()}`; }
function ref(input: ProviderExecutionInput) { return `PAY-SIM-${createHash("sha256").update(input.idempotencyKey ?? JSON.stringify(input.input)).digest("hex").slice(0, 8).toUpperCase()}`; }
function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const capability = getLifeCapability(input.capability.key);
  const contract = capability && lifeProviderActionContract({ capabilityKey: capability.key, action: input.action, riskLevel: capability.risk, requiresApproval: capability.approvalRequired });
  const absent = (contract?.requiredFields ?? []).filter((field) => input.input[field] === undefined || input.input[field] === "");
  if (absent.length) return Promise.resolve({ status: "blocked", toolRunId: runId(input), reason: `Missing ${absent.join(", ")}.`, code: "invalid_input", userMessage: `Add ${absent.join(", ")} to continue.`, nextAction: "add_missing_info", retryable: false });
  const base = { sandbox: true, simulated: true, externalSystemsContacted: false };
  if (input.capability.key === "finance.accounts.read") return Promise.resolve({ status: "ok", toolRunId: runId(input), result: { ...base, accounts: [{ id: "sandbox-checking", name: "Sandbox Current Account", balance: 2841.36, available: 2791.36, currency: "EUR" }] } });
  if (input.capability.key === "finance.transactions.read") return Promise.resolve({ status: "ok", toolRunId: runId(input), result: { ...base, transactions: [{ id: "sandbox-grocery", merchant: "Local Market", amount: 82.45, currency: "EUR", category: "GROCERIES" }] } });
  if (input.capability.key === "finance.budget.analyze") return Promise.resolve({ status: "ok", toolRunId: runId(input), result: { ...base, spending: 1458.64, income: 3200, netCashFlow: 1741.36, currency: "EUR" } });
  if (input.capability.key === "finance.payment.create") return Promise.resolve({ status: "ok", toolRunId: runId(input), actionName: "Sandbox payment simulated", result: { ...base, reference: ref(input), status: input.action === "cancel" ? "cancelled" : "simulated", moneyMoved: false, payeeId: input.input.payeeId, amount: input.input.amount, currency: input.input.currency, notice: "Simulation only. No bank, payee, account, or payment network was contacted." } });
  return Promise.resolve({ status: "blocked", toolRunId: runId(input), reason: "Finance sandbox operation is not implemented.", code: "adapter_not_implemented", userMessage: "This finance sandbox operation is not implemented.", retryable: false });
}
export const financeSandboxProvider: ProviderAdapter = {
  providerId: "finance-sandbox", label: "Finance Sandbox", kind: "native", toolName: "finance.sandbox", capabilities: [...catalogProvider.capabilities], actions: ["search", "quote", "reserve", "prepare_action", "execute_action", "status", "sync_status", "cancel"], requiresConnectedAccount: false, credentialType: "none", authType: "none", riskLevel: "high", description: "Deterministic read-only finance data and payment simulations. It cannot contact a bank or move money.", supportsHealthCheck: true,
  canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute,
  async healthCheck() { return { state: "healthy", message: "Finance sandbox is ready; all outputs are simulated and no money can move.", checkedAt: new Date().toISOString() }; }
};
