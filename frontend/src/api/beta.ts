import { apiGet, apiPatch, apiPost } from "./client";

export type BetaStep = "terms" | "goals" | "agent_installed" | "connector_reviewed" | "first_task" | "approvals_understood" | "support_found";
export type BetaAccess = { enforced: boolean; allowed: boolean; privileged: boolean; cohort: string | null; termsAcceptedAt: string | null; onboarding: { completedSteps?: string[]; goals?: string[]; updatedAt?: string } };
export type BetaInvite = { id: string; email: string; cohort: string; status: string; expiresAt: string; createdAt: string; redeemedAt?: string | null };
export type BetaFeedback = { id: string; category: string; severity: string; expectedResult: string; actualResult: string; contactPreference: string; status: string; createdAt: string; userId: string };
export type BetaMetrics = { cohort: string; invites: number; redeemed: number; activationRate: number; installs: number; successfulRuns: number; approvals: Record<string, number>; transactions: Record<string, number>; supportContacts: number };

export const getBetaAccess = () => apiGet<{ access: BetaAccess | null }>("/api/beta/access");
export const updateBetaOnboarding = (body: { step: BetaStep; completed: boolean; goals?: string[] }) => apiPost<{ onboarding: BetaAccess["onboarding"] }>("/api/beta/onboarding", body);
export const submitBetaFeedback = (body: { category: string; severity: string; expectedResult: string; actualResult: string; consentedDiagnostics?: Record<string, unknown>; contactPreference?: string }) => apiPost<{ feedback: BetaFeedback }>("/api/beta/feedback", body);
export const listBetaInvites = () => apiGet<{ invites: BetaInvite[] }>("/api/beta/admin/invites");
export const createBetaInvite = (body: { email: string; cohort: string; ttlDays: number }) => apiPost<{ invite: BetaInvite; token: string }>("/api/beta/admin/invites", body);
export const revokeBetaInvite = (id: string) => apiPost<{ invite: BetaInvite }>(`/api/beta/admin/invites/${id}/revoke`);
export const replaceBetaInvite = (id: string) => apiPost<{ invite: BetaInvite; token: string }>(`/api/beta/admin/invites/${id}/replace`);
export const listBetaFeedback = (status = "") => apiGet<{ feedback: BetaFeedback[] }>(`/api/beta/admin/feedback${status ? `?status=${status}` : ""}`);
export const updateBetaFeedback = (id: string, status: "open" | "triaged" | "resolved") => apiPatch<{ feedback: BetaFeedback }>(`/api/beta/admin/feedback/${id}`, { status });
export const getBetaMetrics = (cohort = "") => apiGet<{ metrics: BetaMetrics }>(`/api/beta/admin/metrics${cohort ? `?cohort=${cohort}` : ""}`);
