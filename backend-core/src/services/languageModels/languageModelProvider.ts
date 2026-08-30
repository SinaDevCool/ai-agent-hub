import type { AgentCapabilityManifest } from "../agentRuntimeTypes.js";
import type { InterpretationResult } from "../agentInterpretationSchema.js";

export type InterpretationRequest = {
  message: string;
  manifest: AgentCapabilityManifest;
  locale?: string;
};

export type LanguageModelProvider = {
  readonly id: string;
  readonly executionLocation: "device" | "server";
  interpret(request: InterpretationRequest): Promise<InterpretationResult>;
};

