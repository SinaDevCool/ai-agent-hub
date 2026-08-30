import { type FormEvent, useEffect, useState } from "react";
import { setApiAccessToken } from "../api/client";
import { isAuthConfigured, supabase, type AuthSession } from "../api/supabaseClient";
import type { AuthMode } from "../components/shell/AuthScreens";
import { friendlyAuthError, parseDesktopAuthCallback } from "../lib/desktopAuth";

const isDesktopRuntime = () => "__TAURI_INTERNALS__" in window;
const desktopRelay = () => (import.meta.env.VITE_DESKTOP_AUTH_RECOVERY_URL as string | undefined) ?? "https://ai-agent-hub-staging.pages.dev/desktop-auth";

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isAuthConfigured);
  const [authMode, setAuthModeState] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false);
  function setAuthMode(mode: AuthMode) { setAuthModeState(mode); setPassword(""); setConfirmPassword(""); setAuthMessage(""); }

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => { setSession(data.session); setApiAccessToken(data.session?.access_token); if (error) setAuthMessage(friendlyAuthError(error.message)); setIsAuthLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => { setSession(nextSession); setApiAccessToken(nextSession?.access_token); if (event === "PASSWORD_RECOVERY") setAuthModeState("reset-password"); setIsAuthLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !isDesktopRuntime()) return;
    const authClient = supabase; let unlisten: (() => void) | undefined; let cancelled = false;
    const acceptUrls = async (urls: string[]) => {
      const callbacks = urls.filter((value) => value.startsWith("ai-agent-hub://auth/callback")).map(parseDesktopAuthCallback);
      const failure = callbacks.find((callback) => callback.kind === "error"); if (failure?.kind === "error") return setAuthMessage(friendlyAuthError(failure.description));
      const success = callbacks.find((callback) => callback.kind === "success"); if (!success || success.kind !== "success") return;
      setAuthMessage("Completing verification…"); const { error } = await authClient.auth.exchangeCodeForSession(success.code);
      if (error) setAuthMessage(friendlyAuthError(error.message)); else if (success.mode === "recovery") setAuthModeState("reset-password"); else setAuthMessage("Email verified. Your workspace is ready.");
      if (!error) window.focus();
    };
    void import("@tauri-apps/plugin-deep-link").then(async ({ getCurrent, onOpenUrl }) => { const current = await getCurrent(); if (current) await acceptUrls(current); const dispose = await onOpenUrl(acceptUrls); if (cancelled) dispose(); else unlisten = dispose; }).catch((error: unknown) => setAuthMessage(error instanceof Error ? error.message : "Desktop verification callback is unavailable."));
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return;
    if ((authMode === "sign-up" || authMode === "reset-password") && password !== confirmPassword) return setAuthMessage("The passwords do not match.");
    setAuthMessage(""); setIsSubmitting(true);
    try {
      if (authMode === "sign-up") {
        const emailRedirectTo = isDesktopRuntime() ? desktopRelay() : window.location.origin;
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo } }); if (error) throw error;
        if (data.session) setSession(data.session); else setAuthModeState("verify-email");
      } else if (authMode === "forgot-password") {
        const redirectTo = isDesktopRuntime() ? `${desktopRelay()}?mode=recovery` : `${window.location.origin}?mode=recovery`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }); if (error) throw error;
        setAuthMessage("Recovery email sent. Open the newest message to choose a new password.");
      } else if (authMode === "reset-password") {
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
        setAuthMessage("Password updated successfully."); setAuthModeState("sign-in");
      } else { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; }
    } catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "Authentication could not be completed.")); }
    finally { setIsSubmitting(false); }
  }

  async function signOut() { if (!supabase) return; await supabase.auth.signOut(); setApiAccessToken(""); setSession(null); setAuthMode("sign-in"); }
  return { session, isAuthConfigured, isAuthLoading, authMode, setAuthMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, authMessage, isSubmitting, submitAuth, signOut };
}
