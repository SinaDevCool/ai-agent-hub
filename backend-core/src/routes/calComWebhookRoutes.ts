import { Router, type Request } from "express";
import { acceptCalComWebhook } from "../services/calComWebhookService.js";

export const calComWebhookRoutes = Router();
calComWebhookRoutes.post("/", async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) return res.status(400).json({ accepted: false, reason: "raw_body_unavailable" });
  const result = await acceptCalComWebhook({ rawBody, signature: req.header("x-cal-signature-256") ?? undefined, webhookVersion: req.header("x-cal-webhook-version") ?? undefined });
  res.status(result.status).json(result);
});
