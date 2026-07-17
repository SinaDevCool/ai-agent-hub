import { Router } from "express";
import { listToolDefinitions } from "../services/toolRegistryService.js";

export const toolRoutes = Router();

toolRoutes.get("/", (_req, res) => {
  res.json({ tools: listToolDefinitions() });
});
