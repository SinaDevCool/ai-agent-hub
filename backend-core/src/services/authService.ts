import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { ensureUserWorkspace } from "./workspaceService.js";

const supabaseAuth = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

export const isBackendAuthConfigured = Boolean(supabaseAuth);

export async function resolveUserFromBearerToken(token: string) {
  if (!supabaseAuth) return null;

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user.email) return null;

  return ensureUserWorkspace({
    id: data.user.id,
    email: data.user.email
  });
}

export async function resolveDevelopmentUser() {
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (firstUser) return firstUser;

  return ensureUserWorkspace({
    id: "dev-user",
    email: "sample.user@local.ai"
  });
}
