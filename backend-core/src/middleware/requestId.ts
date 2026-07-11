import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function normalizeRequestId(value?: string) {
  if (!value) return randomUUID();
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(trimmed) ? trimmed : randomUUID();
}

export const requestId: RequestHandler = (req, res, next) => {
  const id = normalizeRequestId(req.header("x-request-id"));
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
