import { Router } from "express";
import { z } from "zod";
import { listProviderReceipts } from "../services/providerReceiptService.js";

export const providerReceiptRoutes = Router();

const receiptQuerySchema = z.object({
  agentId: z.string().min(1).optional(),
  capabilityKey: z.string().min(1).optional(),
  status: z.enum(["succeeded", "blocked", "waiting_for_approval"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

providerReceiptRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = receiptQuerySchema.parse(req.query);
  const receipts = await listProviderReceipts({
    userId: req.userId,
    agentId: query.agentId,
    capabilityKey: query.capabilityKey,
    status: query.status,
    limit: query.limit
  });
  res.json({ receipts });
});
