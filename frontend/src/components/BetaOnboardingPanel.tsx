import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { getBetaAccess, updateBetaOnboarding, type BetaAccess, type BetaStep } from "../api/beta";

const steps: Array<{ id: BetaStep; label: string; detail: string }> = [
  { id: "terms", label: "Accept beta terms", detail: "Acknowledge that this is a test environment." },
  { id: "goals", label: "Choose your goals", detail: "Tell the Agent Pool what you want help with." },
  { id: "agent_installed", label: "Add an agent", detail: "Install one restricted agent from the pool." },
  { id: "connector_reviewed", label: "Review connections", detail: "Connect a provider or deliberately skip it." },
  { id: "first_task", label: "Run a safe first task", detail: "Start with a read-only request." },
  { id: "approvals_understood", label: "Understand approvals", detail: "Know where sensitive actions pause." },
  { id: "support_found", label: "Find support", detail: "Use the beta feedback form when something is unclear." }
];
const goalOptions = ["Plan travel", "Manage money", "Handle daily tasks", "Organize applications", "Coordinate life admin"];

export function BetaOnboardingPanel() {
  const [access, setAccess] = useState<BetaAccess | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const completed = useMemo(() => new Set(access?.onboarding.completedSteps ?? []), [access]);
  useEffect(() => { void getBetaAccess().then((result) => setAccess(result.access)).catch(() => setAccess(null)); }, []);
  if (!access || (!access.allowed && !access.enforced)) return null;
  const onboarding = access.onboarding;

  async function toggle(step: BetaStep, value: boolean, goals?: string[]) {
    setBusy(step); setError("");
    try { const result = await updateBetaOnboarding({ step, completed: value, goals }); setAccess((current) => current ? { ...current, onboarding: result.onboarding } : current); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Progress could not be saved."); }
    finally { setBusy(""); }
  }
  function toggleGoal(goal: string) {
    const goals = onboarding.goals ?? [];
    const next = goals.includes(goal) ? goals.filter((item) => item !== goal) : [...goals, goal];
    void toggle("goals", next.length > 0, next);
  }
  const count = steps.filter((step) => completed.has(step.id)).length;
  return <section className="panel beta-onboarding" aria-label="Private beta onboarding">
    <div className="beta-heading"><div><div className="panel-title">Private beta setup</div><h2>Finish your safe-start checklist</h2><p>Your progress is saved, so you can leave and return at any time.</p></div><strong>{count}/{steps.length}</strong></div>
    <div className="beta-progress"><span style={{ width: `${count / steps.length * 100}%` }} /></div>
    {error ? <p className="friendly-error" role="alert">{error}</p> : null}
    <div className="beta-step-list">{steps.map((step) => <div className={completed.has(step.id) ? "beta-step complete" : "beta-step"} key={step.id}>
      <button disabled={busy === step.id} onClick={() => void toggle(step.id, !completed.has(step.id))} type="button">{completed.has(step.id) ? <Check size={16} /> : <Circle size={16} />}<span><strong>{step.label}</strong><small>{step.detail}</small></span><ChevronRight size={16} /></button>
      {step.id === "goals" ? <div className="beta-goals">{goalOptions.map((goal) => <button className={(onboarding.goals ?? []).includes(goal) ? "selected" : ""} key={goal} onClick={() => toggleGoal(goal)} type="button">{goal}</button>)}</div> : null}
    </div>)}</div>
  </section>;
}
