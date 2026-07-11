import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const statusCode = error instanceof ZodError ? 400 : error.statusCode ?? 500;
  const message = error instanceof ZodError
    ? "Check the details and try again."
    : statusCode >= 500 && env.NODE_ENV === "production"
      ? "Internal server error"
      : error.message ?? "Internal server error";
  const code = error instanceof ZodError ? "validation_error" : error.code ?? "internal_error";
  const requestId = req.requestId;

  if (statusCode >= 500) {
    logger.error({ error, requestId }, "Unhandled request error");
  } else {
    logger.warn({ error, requestId }, "Request rejected");
  }
  res.status(statusCode).json({
    error: {
      message,
      code,
      requestId
    }
  });
};
