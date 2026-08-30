import type { AgentCapabilityManifest } from "./agentRuntimeTypes.js";
import { interpretationResultSchema, type InterpretationResult } from "./agentInterpretationSchema.js";
import { rulesLanguageModelProvider } from "./languageModels/rulesLanguageModelProvider.js";

export async function interpretAgentMessage(input: {
  message: string;
  manifest: AgentCapabilityManifest;
}): Promise<InterpretationResult> {
  return interpretationResultSchema.parse(await rulesLanguageModelProvider.interpret(input));
}

export function validateInterpretationForManifest(input: {
  interpretation: InterpretationResult;
  manifest: AgentCapabilityManifest;
}) {
  const interpretation = interpretationResultSchema.parse(input.interpretation);
  const declaredTools = new Set(input.manifest.tools ?? []);
  if (interpretation.proposedTool && !declaredTools.has(interpretation.proposedTool)) {
    return { ok: false as const, reason: "The proposed tool is not declared by this agent." };
  }
  if (interpretation.intent === "action" && interpretation.requiresClarification) {
    return { ok: false as const, reason: "A write action cannot run while required information is missing." };
  }
  if (interpretation.missingFields.length || interpretation.requiresClarification) {
    return { ok: false as const, reason: `More information is required${interpretation.missingFields.length ? `: ${interpretation.missingFields.join(", ")}` : "."}` };
  }
  return { ok: true as const, interpretation };
}

export function interpretationExecutionMessage(interpretation: InterpretationResult) {
  const argumentsText = Object.entries(interpretation.arguments)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("; ");
  return [interpretation.intent, interpretation.proposedTool, argumentsText].filter(Boolean).join(" ").slice(0, 1200);
}

