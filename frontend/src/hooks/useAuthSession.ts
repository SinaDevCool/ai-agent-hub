import { type FormEvent, useEffect, useState } from "react";
import { setApiAccessToken } from "../api/client";
import { isAuthConfigured, supabase, type AuthSession } from "../api/supabaseClient";
import { friendlyAuthError, parseDesktopAuthCallback } from "../lib/desktopAuth";

const isDesktopRuntime = () => "__TAURI_INTERNALS__" in window;

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isAuthConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isSigningInWithPassword, setIsSigningInWithPassword] = useState(false);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState("");
  const isStagingPasswordSignInEnabled = import.meta.env.VITE_ENABLE_PASSWORD_SIGN_IN === "true";

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      setApiAccessToken(data.session?.access_token);
      if (error) setAuthMessage(friendlyAuthError(error.message));
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token);
      setIsAuthLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !isDesktopRuntime()) return;
    const authClient = supabase;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const acceptUrls = async (urls: string[]) => {
      const callbacks = urls
        .filter((value) => value.startsWith("ai-agent-hub://auth/callback"))
        .map(parseDesktopAuthCallback);
      const failure = callbacks.find((callback) => callback.kind === "error");
      if (failure?.kind === "error") {
        setAuthMessage(friendlyAuthError(failure.description));
        return;
      }
      const success = callbacks.find((callback) => callback.kind === "success");
      if (!success || success.kind !== "success") return;
      setAuthMessage("Completing sign-in…");
      const { error } = await authClient.auth.exchangeCodeForSession(success.code);
      setAuthMessage(error ? friendlyAuthError(error.message) : "Signed in successfully. Opening your workspace…");
      if (!error) window.focus();
    };

    void import("@tauri-apps/plugin-deep-link").then(async ({ getCurrent, onOpenUrl }) => {
      const current = await getCurrent();
      if (current) await acceptUrls(current);
      const dispose = await onOpenUrl(acceptUrls);
      if (cancelled) dispose(); else unlisten = dispose;
    }).catch((error: unknown) => {
      setAuthMessage(error instanceof Error ? error.message : "Desktop sign-in callback is unavailable.");
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthMessage("");
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: isDesktopRuntime()
            ? (import.meta.env.VITE_DESKTOP_AUTH_REDIRECT_URL as string | undefined)
              ?? "ai-agent-hub://auth/callback"
            : window.location.origin
        }
      });
      if (error) throw error;
      setMagicLinkSentTo(email.trim());
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "Could not send sign-in link."));
    } finally {
      setIsSendingMagicLink(false);
    }
  }

  function resetMagicLink() {
    setMagicLinkSentTo("");
    setAuthMessage("");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setApiAccessToken("");
    setSession(null);
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isStagingPasswordSignInEnabled) return;

    setAuthMessage("");
    setIsSigningInWithPassword(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "Could not sign in."));
    } finally {
      setIsSigningInWithPassword(false);
    }
  }

  return {
    session,
    isAuthConfigured,
    isAuthLoading,
    email,
    setEmail,
    password,
    setPassword,
    authMessage,
    magicLinkSentTo,
    isSendingMagicLink,
    isSigningInWithPassword,
    isStagingPasswordSignInEnabled,
    sendMagicLink,
    resetMagicLink,
    signInWithPassword,
    signOut
  };
}
