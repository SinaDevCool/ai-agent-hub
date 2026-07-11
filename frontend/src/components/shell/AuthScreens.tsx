import { Activity, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";

export function AuthLoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <h1>Opening your workspace</h1>
        <p>Checking your private session.</p>
      </section>
    </main>
  );
}

export function AuthSignInScreen(props: {
  authMessage: string;
  email: string;
  isSendingMagicLink: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <h1>Find your AI agents</h1>
        <p>Add a travel agent, money agent, or daily-task agent. You decide what each one can see.</p>
        <div className="auth-trust-list" aria-label="Privacy promises">
          <span><ShieldCheck size={15} /> Private by default</span>
          <span><KeyRound size={15} /> You approve access</span>
          <span><Activity size={15} /> Receipts stay visible</span>
        </div>
        <form className="auth-form" onSubmit={props.onSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => props.onEmailChange(event.currentTarget.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={props.email}
            />
          </label>
          <button disabled={props.isSendingMagicLink} type="submit">
            <Mail size={16} /> {props.isSendingMagicLink ? "Sending…" : "Send magic link"}
          </button>
        </form>
        {props.authMessage ? <p className="auth-message">{props.authMessage}</p> : null}
      </section>
    </main>
  );
}
