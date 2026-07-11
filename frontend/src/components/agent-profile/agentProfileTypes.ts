import type { VaultSchema } from "../../api/types";

export type HelperPrompt = {
  label: string;
  prompt: string;
  detail: string;
  tone: "info" | "safe" | "approval";
};

export type PermissionReviewItem = {
  schema?: VaultSchema;
  schemaName: string;
  granted: boolean;
};

export type ToneState = {
  tone: "blue" | "amber" | "green" | "red";
  label: string;
  detail: string;
};
