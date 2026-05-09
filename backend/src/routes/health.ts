/**
 * Health Check Routes
 */

import { Router, Response } from "express";

const router = Router();

/**
 * GET /health
 */
router.get("/", (_req, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default router;
