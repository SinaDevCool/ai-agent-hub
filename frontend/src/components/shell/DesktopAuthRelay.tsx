import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Mail, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabase } from "../../api/supabaseClient";
import { desktopDeepLink, friendlyAuthError, parseDesktopAuthCallback } from "../../lib/desktopAuth";

const relayUrl = () => `${window.location.origin}/desktop-auth`;

export function DesktopAuthRelay() {
  const callback = useMemo(() => parseDesktopAuthCallback(window.location.href), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const destination = callback.kind === "success" ? desktopDeepLink(callback.code) : "";

  useEffect(() => {
    if (!destination) return;
    const timer = window.setTimeout(() => window.location.assign(destination), 150);
    return () => window.clearTimeout(timer);
  }, [destination]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }
    setIsSending(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: relayUrl() }
      });
      if (error) throw error;
      setMessage("A new link is on its way. Open only the newest AI Agent Hub email.");
    } catch (error) {
      setMessage(friendlyAuthError(error instanceof Error ? error.message : "Could not send a new link."));
    } finally {
      setIsSending(false);
    }
  }

  if (callback.kind === "success") {
    return (
      <main className="auth-shell">
        <section className="auth-panel auth-relay-panel" role="status">
          <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
          <CheckCircle2 className="auth-relay-icon success" size={42} />
          <h1>Email verified</h1>
          <p>We’re returning you to the desktop app and signing you in.</p>
          <a className="button-link" href={destination}><ExternalLink size={16} /> Open AI Agent Hub</a>
          <small>If the app does not open automatically, use the button above. You can then close this tab.</small>
        </section>
      </main>
    );
  }

  const expired = callback.kind === "error" && (callback.code === "otp_expired" || callback.description.toLowerCase().includes("expired"));
  return (
    <main className="auth-shell">
      <section className="auth-panel auth-relay-panel" role="alert">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <TriangleAlert className="auth-relay-icon warning" size={42} />
        <h1>{expired ? "That link has expired" : "We couldn’t complete sign-in"}</h1>
        <p>{callback.kind === "error"
          ? friendlyAuthError(callback.description)
          : "This link is incomplete. Request a fresh link and open the newest email."}</p>
        <form className="auth-form" onSubmit={resend}>
          <label>
            <span>Email</span>
            <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="you@example.com" required type="email" value={email} />
          </label>
          <button disabled={isSending} type="submit">
            {isSending ? <RefreshCw className="spin" size={16} /> : <Mail size={16} />}
            {isSending ? "Sending new link…" : "Send me a new link"}
          </button>
        </form>
        {message ? <p className="auth-message" role="status">{message}</p> : null}
        <small>For security, each link is single-use. Requesting another link replaces older ones.</small>
      </section>
    </main>
  );
}
