import { randomUUID } from "node:crypto";
import { badRequest } from "../errors/httpError.js";
import { getLifeCapability, routeLifeProviders, type ExecutionLevel } from "./lifePlatformCatalog.js";
import { prisma } from "../db/prisma.js";
import { decodeJson, encodeJson } from "./jsonService.js";

export type LifeTransactionState =
  | "draft"
  | "validated"
  | "awaiting_approval"
  | "executing"
  | "confirmed"
  | "failed"
  | "uncertain"
  | "reconciliation_required"
  | "cancelled"
  | "expired";

export type LifeActionPlan = {
  id: string;
  capabilityKey: string;
  executionLevel: ExecutionLevel;
  state: LifeTransactionState;
  region?: string;
  providerId?: string;
  providerCandidates: string[];
  approvalRequired: boolean;
  idempotencyKey: string;
  input: Record<string, unknown>;
  createdAt: string;
};

const allowedTransitions: Record<LifeTransactionState, LifeTransactionState[]> = {
  draft: ["validated", "failed", "expired"],
  validated: ["awaiting_approval", "executing", "failed", "expired"],
  awaiting_approval: ["executing", "cancelled", "expired"],
  executing: ["confirmed", "failed", "uncertain"],
  uncertain: ["confirmed", "failed", "reconciliation_required"],
  reconciliation_required: ["confirmed", "failed", "cancelled"],
  confirmed: ["cancelled", "reconciliation_required"],
  failed: [],
  cancelled: [],
  expired: []
};
const lifeTransactionStates = new Set<LifeTransactionState>(Object.keys(allowedTransitions) as LifeTransactionState[]);

export function isLifeTransactionState(value: string): value is LifeTransactionState {
  return lifeTransactionStates.has(value as LifeTransactionState);
}

export function createLifeActionPlan(input: {
  capabilityKey: string;
  executionLevel: ExecutionLevel;
  region?: string;
  providerId?: string;
  values?: Record<string, unknown>;
  idempotencyKey?: string;
}): LifeActionPlan {
  const capability = getLifeCapability(input.capabilityKey);
  if (!capability) throw badRequest("Unknown life capability.");
  if (!capability.executionLevels.includes(input.executionLevel)) {
    throw badRequest(`Capability '${capability.key}' does not support '${input.executionLevel}'.`);
  }
  const candidates = routeLifeProviders({ capabilityKey: capability.key, region: input.region, requiredLevel: input.executionLevel });
  if (input.providerId && !candidates.some((item) => item.id === input.providerId)) {
    throw badRequest("The selected provider cannot perform this capability in the requested region and execution level.");
  }
  return {
    id: randomUUID(),
    capabilityKey: capability.key,
    executionLevel: input.executionLevel,
    state: "draft",
    region: input.region,
    providerId: input.providerId,
    providerCandidates: candidates.map((item) => item.id),
    approvalRequired: capability.approvalRequired || ["transact", "manage"].includes(input.executionLevel),
    idempotencyKey: input.idempotencyKey?.trim() || randomUUID(),
    input: input.values ?? {},
    createdAt: new Date().toISOString()
  };
}

export function transitionLifeAction(plan: LifeActionPlan, next: LifeTransactionState): LifeActionPlan {
  if (!isLifeTransactionState(next)) throw badRequest("Unknown transaction state.");
  if (!allowedTransitions[plan.state].includes(next)) {
    throw badRequest(`Invalid transaction transition from '${plan.state}' to '${next}'.`);
  }
  if (next === "executing" && plan.approvalRequired && plan.state !== "awaiting_approval") {
    throw badRequest("This action must pass through explicit approval before execution.");
  }
  return { ...plan, state: next };
}

export function validateLifeActionPlan(plan: LifeActionPlan) {
  if (plan.providerCandidates.length === 0) throw badRequest("No provider supports this capability in the requested region.");
  return transitionLifeAction(plan, "validated");
}

export function nextLifeActionState(plan: LifeActionPlan) {
  if (plan.state !== "validated") throw badRequest("Only a validated plan can advance to approval or execution.");
  return transitionLifeAction(plan, plan.approvalRequired ? "awaiting_approval" : "executing");
}

export async function persistLifeActionPlan(userId: string, plan: LifeActionPlan) {
  return prisma.lifeTransaction.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey: plan.idempotencyKey } },
    update: {},
    create: {
      userId,
      capabilityKey: plan.capabilityKey,
      executionLevel: plan.executionLevel,
      state: plan.state,
      region: plan.region,
      providerId: plan.providerId,
      providerCandidatesJson: encodeJson(plan.providerCandidates),
      approvalRequired: plan.approvalRequired,
      idempotencyKey: plan.idempotencyKey,
      inputJson: encodeJson(plan.input)
    }
  });
}

export async function persistAwaitingLifeApproval(input: {
  userId: string;
  capabilityKey: string;
  region?: string;
  providerId: string;
  values: Record<string, unknown>;
  idempotencyKey?: string;
  hitlRequestId: string;
}) {
  let plan = validateLifeActionPlan(createLifeActionPlan({
    capabilityKey: input.capabilityKey,
    executionLevel: "transact",
    region: input.region,
    values: input.values,
    idempotencyKey: input.idempotencyKey
  }));
  plan = nextLifeActionState(plan);
  const saved = await persistLifeActionPlan(input.userId, plan);
  return prisma.lifeTransaction.update({ where: { id: saved.id }, data: { hitlRequestId: input.hitlRequestId, providerId: input.providerId } });
}

export function serializeLifeTransaction(value: Awaited<ReturnType<typeof persistLifeActionPlan>>) {
  return {
    ...value,
    providerCandidates: decodeJson<string[]>(value.providerCandidatesJson, []),
    input: decodeJson<Record<string, unknown>>(value.inputJson, {}),
    result: decodeJson<Record<string, unknown>>(value.resultJson, {}),
    providerCandidatesJson: undefined,
    inputJson: undefined,
    resultJson: undefined
  };
}

export async function listLifeTransactions(userId: string) {
  const rows = await prisma.lifeTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map(serializeLifeTransaction);
}

export async function transitionPersistedLifeTransaction(input: {
  userId: string;
  id: string;
  next: LifeTransactionState;
  result?: Record<string, unknown>;
  externalReference?: string;
  failureReason?: string;
  hitlRequestId?: string;
}) {
  const current = await prisma.lifeTransaction.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!current) throw badRequest("Life transaction was not found.");
  const plan: LifeActionPlan = {
    id: current.id,
    capabilityKey: current.capabilityKey,
    executionLevel: current.executionLevel as ExecutionLevel,
    state: current.state as LifeTransactionState,
    region: current.region ?? undefined,
    providerId: current.providerId ?? undefined,
    providerCandidates: decodeJson<string[]>(current.providerCandidatesJson, []),
    approvalRequired: current.approvalRequired,
    idempotencyKey: current.idempotencyKey,
    input: decodeJson<Record<string, unknown>>(current.inputJson, {}),
    createdAt: current.createdAt.toISOString()
  };
  transitionLifeAction(plan, input.next);
  const terminal = ["confirmed", "failed", "cancelled", "expired"].includes(input.next);
  return serializeLifeTransaction(await prisma.lifeTransaction.update({
    where: { id: current.id },
    data: {
      state: input.next,
      resultJson: input.result ? encodeJson(input.result) : current.resultJson,
      externalReference: input.externalReference ?? current.externalReference,
      failureReason: input.failureReason ?? current.failureReason,
      hitlRequestId: input.hitlRequestId ?? current.hitlRequestId,
      completedAt: terminal ? new Date() : null
    }
  }));
}

export async function finishLifeTransactionForApproval(input: { userId: string; hitlRequestId: string; succeeded: boolean; result?: Record<string, unknown>; failureReason?: string }) {
  const row = await prisma.lifeTransaction.findFirst({ where: { userId: input.userId, hitlRequestId: input.hitlRequestId } });
  if (!row) return null;
  if (row.state === "awaiting_approval") {
    await transitionPersistedLifeTransaction({ userId: input.userId, id: row.id, next: "executing" });
  }
  return transitionPersistedLifeTransaction({
    userId: input.userId,
    id: row.id,
    next: input.succeeded ? "confirmed" : "failed",
    result: input.result,
    failureReason: input.failureReason
  });
}
