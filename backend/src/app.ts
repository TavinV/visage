/**
 * Main Express App
 */

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";

// Routes
import authRoutes from "./routes/auth";
import tenantRoutes from "./routes/tenants";
import healthRoutes from "./routes/health";
import planRoutes from "./routes/plans";

export function createApp(): Express {
  const app = express();

  // Security
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Request logging
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info(
        {
          method: _req.method,
          path: _req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        },
        "HTTP Request"
      );
    });

    next();
  });

  // Routes
  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/tenants", tenantRoutes);
  app.use("/plans", planRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "Not found",
      code: "not_found",
    });
  });

  // Error handler (deve ser o último middleware)
  app.use(errorHandler);

  return app;
}
