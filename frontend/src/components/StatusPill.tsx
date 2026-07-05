import type { ReactNode } from "react";

export function StatusPill({ tone, children }: { tone: "blue" | "amber" | "green" | "red"; children: ReactNode }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
