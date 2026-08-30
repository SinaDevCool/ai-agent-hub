import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

type EvaluationEvidence = { generatedAt?: string; totalCases?: number; gates?: Record<string, boolean>; metrics?: Record<string, number> };

export async function getLocalAiReadiness() {
  let evaluation: EvaluationEvidence | null = null;
  try {
    evaluation = JSON.parse(await readFile(path.resolve(process.cwd(), "release-evidence", "local-ai-evaluation.json"), "utf8")) as EvaluationEvidence;
  } catch { evaluation = null; }
  const evaluationPassed = Boolean(evaluation && Object.values(evaluation.gates ?? {}).every(Boolean));
  const flags = {
    localAi: env.LOCAL_AI_ENABLED === "true",
    planEndpoint: env.LOCAL_AI_PLAN_ENDPOINT_ENABLED === "true",
    localResponses: env.LOCAL_RESPONSE_GENERATION_ENABLED === "true",
    localEmbeddings: env.LOCAL_EMBEDDINGS_ENABLED === "true",
    cloudFallback: env.CLOUD_LLM_FALLBACK_ENABLED === "true",
    model3b: env.LOCAL_AI_MODEL_3B_ENABLED === "true",
    model8b: env.LOCAL_AI_MODEL_8B_ENABLED === "true"
  };
  const checks = [
    { key: "kill_switch", label: "Kill switch", status: env.LOCAL_AI_KILL_SWITCH === "true" ? "block" : "pass", detail: env.LOCAL_AI_KILL_SWITCH === "true" ? "Local AI is stopped globally." : "Local AI is not globally stopped." },
    { key: "typed_plan", label: "Typed plan endpoint", status: flags.localAi && flags.planEndpoint ? "pass" : "warning", detail: flags.planEndpoint ? "Schema-validated plans are accepted." : "Plan endpoint is disabled." },
    { key: "evaluation", label: "Evaluation evidence", status: evaluationPassed ? "pass" : "block", detail: evaluationPassed ? `${evaluation?.totalCases ?? 0} cases passed the configured gates.` : "Run npm run evaluate:local-ai before release." },
    { key: "cloud_fallback", label: "Cloud fallback", status: flags.cloudFallback ? "warning" : "pass", detail: flags.cloudFallback ? "Cloud fallback is enabled; verify consent and data controls." : "No automatic cloud fallback is enabled." }
  ] as const;
  return {
    status: checks.some((item) => item.status === "block") ? "blocked" : checks.some((item) => item.status === "warning") ? "conditional" : "ready",
    generatedAt: new Date().toISOString(), flags, evaluation, checks,
    rollback: "Set AI_RUNTIME_MODE=rules and LOCAL_AI_KILL_SWITCH=true."
  };
}
