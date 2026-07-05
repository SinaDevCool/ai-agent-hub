import type { RequestHandler } from "express";
import { prisma } from "../db/prisma.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requestContext: RequestHandler = async (req, _res, next) => {
  const explicitUserId = req.header("x-user-id");
  if (explicitUserId) {
    req.userId = explicitUserId;
    return next();
  }
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  req.userId = firstUser?.id;
  next();
};
