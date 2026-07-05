import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error({ error }, "Unhandled request error");
  res.status(error.statusCode ?? 500).json({
    error: {
      message: error.message ?? "Internal server error",
      code: error.code ?? "internal_error"
    }
  });
};
