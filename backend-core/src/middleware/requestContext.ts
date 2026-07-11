import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { isBackendAuthConfigured, resolveDevelopmentUser, resolveUserFromBearerToken } from "../services/authService.js";
import { ensureUserWorkspace } from "../services/workspaceService.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export const requestContext: RequestHandler = async (req, _res, next) => {
  if (req.path === "/health") return next();

  const explicitUserId = req.header("x-user-id");
  if (env.NODE_ENV !== "production" && !isBackendAuthConfigured && explicitUserId) {
    const user = await ensureUserWorkspace({
      id: explicitUserId,
      email: req.header("x-user-email") || `${explicitUserId}@local.test`
    });
    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  }

  const bearerToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken) {
    const user = await resolveUserFromBearerToken(bearerToken);
    if (user) {
      req.userId = user.id;
      req.userEmail = user.email;
      return next();
    }
  }

  if (isBackendAuthConfigured) return next();
  if (env.NODE_ENV === "production") return next();

  const developmentUser = await resolveDevelopmentUser();
  req.userId = developmentUser.id;
  req.userEmail = developmentUser.email;
  next();
};
