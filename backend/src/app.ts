/**
 * Main Express App
 */

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";
import { createGlobalLimiter, createLoginLimiter, createAuthLimiter } from "./middleware/rateLimit";

// Routes
import authRoutes from "./routes/auth";
import tenantRoutes from "./routes/tenants";
import healthRoutes from "./routes/health";
import planRoutes from "./routes/plans";
import tenantSettingsRoutes from "./routes/tenant-settings";
import devicesRoutes from "./routes/devices";
import locationsRoutes from "./routes/locations";
import academicPeriodsRoutes from "./routes/academic-periods";
import coursesRoutes from "./routes/courses";
import classesRoutes from "./routes/classes";
import classEnrollmentsRoutes from "./routes/class-enrollments";
import classSessionsRoutes from "./routes/class-sessions";
import usersRoutes from "./routes/users";
import studentsRoutes from "./routes/students";
import enrollmentRoutes from "./routes/enrollment";
import createDeviceRouter from "./routes/device";
import reportsRoutes from "./routes/reports";
import auditRoutes from "./routes/audit";
import adminRoutes from "./routes/admin";

export function createApp(): Express {
  const app = express();

  // Criar limiters após o Redis já estar conectado
  const globalLimiter = createGlobalLimiter();
  const loginLimiter = createLoginLimiter();
  const authLimiter = createAuthLimiter();

  // Security
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );

  // Rate limiting global
  app.use(globalLimiter);

  // Body parsing — limites pequenos por rota (segurança contra payload bombing)
  // Rotas de auth e admin só precisam de JSON mínimo
  app.use("/auth",    express.json({ limit: "16kb" }), express.urlencoded({ limit: "16kb", extended: false }));
  app.use("/plans",   express.json({ limit: "16kb" }), express.urlencoded({ limit: "16kb", extended: false }));
  app.use("/tenants", express.json({ limit: "64kb" }), express.urlencoded({ limit: "64kb", extended: false }));
  // Frames JPEG em base64 (totem): até ~1MB de imagem → ~1.4MB em base64
  app.use("/device",     express.json({ limit: "2mb" }));
  app.use("/enrollment", express.json({ limit: "2mb" }));
  // Fallback para rotas futuras (ex: upload de frames via face engine)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

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
  app.use("/auth/login", loginLimiter);
  app.use("/auth", authLimiter);
  app.use("/auth", authRoutes);
  app.use("/tenants", tenantRoutes);
  app.use("/plans", planRoutes);
  app.use("/tenant-settings", tenantSettingsRoutes);
  app.use("/devices", devicesRoutes);
  app.use("/locations", locationsRoutes);
  app.use("/academic-periods", academicPeriodsRoutes);
  app.use("/courses", coursesRoutes);
  app.use("/classes", classesRoutes);
  app.use("/class-enrollments", classEnrollmentsRoutes);
  app.use("/class-sessions", classSessionsRoutes);
  app.use("/users", usersRoutes);
  app.use("/students", studentsRoutes);
  app.use("/enrollment", enrollmentRoutes);
  app.use("/device", createDeviceRouter());
  app.use("/attendance/reports", reportsRoutes);
  app.use("/audit", auditRoutes);
  app.use("/admin", adminRoutes);

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
