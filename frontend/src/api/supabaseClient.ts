import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isAuthConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export type AuthSession = Session;
