import { useState, type FormEvent } from "react";
import { MessageSquareText } from "lucide-react";
import { submitBetaFeedback } from "../api/beta";

export function BetaFeedbackPanel({ className = "" }: { className?: string }) {
  const [category, setCategory] = useState("usability"); const [severity, setSeverity] = useState("low");
  const [expected, setExpected] = useState(""); const [actual, setActual] = useState("");
  const [diagnostics, setDiagnostics] = useState(true); const [email, setEmail] = useState(false);
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(""); try { await submitBetaFeedback({ category, severity, expectedResult: expected, actualResult: actual, contactPreference: email ? "email" : "none", consentedDiagnostics: diagnostics ? { environment: import.meta.env.MODE, release: import.meta.env.VITE_RELEASE_SHA ?? "local" } : {} }); setExpected(""); setActual(""); setMessage("Feedback received. Thank you for helping improve the beta."); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Feedback could not be sent."); } finally { setSaving(false); } }
  return <section className={`panel beta-feedback ${className}`}><div className="panel-title">Beta support</div><h2><MessageSquareText size={20} /> Report a problem</h2><p>Describe the outcome without pasting passwords, tokens, private notes, or provider payloads.</p>
    <form onSubmit={(event) => void submit(event)}><div className="beta-form-row"><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{["access","connector","provider","privacy_security","transaction","usability","other"].map((item) => <option key={item} value={item}>{item.replace(/_/g," ")}</option>)}</select></label><label>Severity<select value={severity} onChange={(e) => setSeverity(e.target.value)}>{["low","medium","high","critical"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label>What did you expect?<textarea required minLength={3} maxLength={2000} rows={3} value={expected} onChange={(e) => setExpected(e.target.value)} /></label><label>What actually happened?<textarea required minLength={3} maxLength={2000} rows={3} value={actual} onChange={(e) => setActual(e.target.value)} /></label>
      <label className="beta-check"><input checked={diagnostics} onChange={(e) => setDiagnostics(e.target.checked)} type="checkbox" /> Include release and environment identifiers only</label><label className="beta-check"><input checked={email} onChange={(e) => setEmail(e.target.checked)} type="checkbox" /> You may contact me by account email</label>
      <button disabled={saving} type="submit">{saving ? "Sending…" : "Send feedback"}</button>{message ? <p role="status">{message}</p> : null}</form>
  </section>;
}
