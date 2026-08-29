import { Router } from "express";
import { z } from "zod";
import { continueHostedTravelCheckout, prepareHostedTravelCheckout } from "../services/hostedTravelCheckoutService.js";

export const travelCheckoutRoutes = Router();

travelCheckoutRoutes.post("/prepare", async (req, res) => {
  const body = z.object({ agentId: z.string().min(1), offer: z.unknown(), idempotencyKey: z.string().trim().min(8).max(200), acceptedAmount: z.string(), acceptedCurrency: z.string(), priceChangeAccepted: z.boolean().optional() }).parse(req.body);
  res.status(201).json(await prepareHostedTravelCheckout({ userId: req.userId!, ...body }));
});

travelCheckoutRoutes.post("/:id/continue", async (req, res) => {
  const body = z.object({ checkoutUrl: z.string().url() }).parse(req.body);
  res.json(await continueHostedTravelCheckout({ userId: req.userId!, transactionId: req.params.id, checkoutUrl: body.checkoutUrl }));
});
