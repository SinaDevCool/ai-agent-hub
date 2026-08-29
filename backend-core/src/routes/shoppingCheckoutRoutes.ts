import { Router } from "express";
import { z } from "zod";
import { continueHostedShopping, prepareHostedShopping } from "../services/hostedShoppingService.js";
export const shoppingCheckoutRoutes = Router();
shoppingCheckoutRoutes.post("/prepare", async (req, res) => { const body = z.object({ agentId: z.string().min(1), title: z.string().trim().min(1).max(100), items: z.array(z.object({ name: z.string(), quantity: z.number().optional() })).min(1).max(100), idempotencyKey: z.string().trim().min(8).max(200) }).parse(req.body); res.status(201).json(await prepareHostedShopping({ userId: req.userId!, ...body })); });
shoppingCheckoutRoutes.post("/:id/continue", async (req, res) => { res.json(await continueHostedShopping({ userId: req.userId!, transactionId: req.params.id })); });
