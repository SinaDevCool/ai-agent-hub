import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) {
    logger.error({ error }, "Unhandled request error");
  } else {
    logger.warn({ error }, "Request rejected");
  }
  res.status(statusCode).json({
    error: {
      message: error.message ?? "Internal server error",
      code: error.code ?? "internal_error"
    }
  });
};
