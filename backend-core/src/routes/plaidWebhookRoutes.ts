import { Router, type Request } from "express";
import { acceptPlaidWebhook } from "../services/plaidWebhookService.js";

export const plaidWebhookRoutes = Router();
plaidWebhookRoutes.post("/", async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody; if (!rawBody) return res.status(400).json({ accepted: false, reason: "raw_body_unavailable" });
  const result = await acceptPlaidWebhook({ rawBody, verification: req.header("plaid-verification") ?? undefined }); res.status(result.status).json(result);
});
