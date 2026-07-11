import type { RequestHandler } from "express";

export const requireUser: RequestHandler = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({
      error: {
        message: "Authentication required",
        code: "auth_required",
        requestId: req.requestId
      }
    });
  }
  next();
};
