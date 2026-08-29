import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { httpError } from "../errors/httpError.js";
import { getBetaAccess } from "../services/betaService.js";

export const requireBetaAccess: RequestHandler = async (req, _res, next) => {
  if (env.PRIVATE_BETA_ENFORCED !== "true") return next();
  const access = await getBetaAccess(req.userId!);
  if (!access?.allowed) return next(httpError(403, "This environment is available to invited beta accounts only.", "private_beta_invite_required"));
  next();
};
