import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isAuthConfigured ? createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    // Keep a verified user signed in across desktop restarts and refresh expired
    // access tokens silently. Desktop callbacks are exchanged explicitly via
    // the registered ai-agent-hub:// protocol.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !("__TAURI_INTERNALS__" in globalThis),
    storageKey: "ai-agent-hub-auth"
  }
}) : null;

export type AuthSession = Session;
