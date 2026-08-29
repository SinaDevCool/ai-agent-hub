import { type FormEvent, useEffect, useState } from "react";
import { setApiAccessToken } from "../api/client";
import { isAuthConfigured, supabase, type AuthSession } from "../api/supabaseClient";

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isAuthConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isSigningInWithPassword, setIsSigningInWithPassword] = useState(false);
  const isStagingPasswordSignInEnabled = import.meta.env.VITE_APP_ENV === "staging";

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setApiAccessToken(data.session?.access_token);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token);
      setIsAuthLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthMessage("");
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setAuthMessage("Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not send sign-in link.");
    } finally {
      setIsSendingMagicLink(false);
    }
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
      setAuthMessage(error instanceof Error ? error.message : "Could not sign in.");
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
    isSendingMagicLink,
    isSigningInWithPassword,
    isStagingPasswordSignInEnabled,
    sendMagicLink,
    signInWithPassword,
    signOut
  };
}
