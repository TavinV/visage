/**
 * Environment configuration
 */

import { logger } from "./logger";

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOptional(
  key: string,
  defaultValue?: string,
): string | undefined {
  return process.env[key] || defaultValue;
}

export const config = {
  // API
  nodeEnv: getEnv("NODE_ENV", "development"),
  port: parseInt(getEnv("PORT", "3000"), 10),
  apiUrl: getEnv("API_URL", "http://localhost:3000"),
  // Base dos links enviados por email (ex.: redefinição de senha)
  frontendUrl: getEnv("FRONTEND_URL", "http://localhost:3001"),

  // Database
  databaseUrl: getEnv("DATABASE_URL"),

  // Security
  masterKey: getEnv("MASTER_KEY"),
  jwtSecret: getEnv("JWT_SECRET"),
  jwtExpiresIn: getEnv("JWT_EXPIRES_IN", "15m"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  jwtRefreshExpiresIn: parseInt(
    getEnv("JWT_REFRESH_EXPIRES_IN_SECONDS", "604800"),
    10,
  ), // 7 dias

  // Super Admin (bootstrap)
  superAdminEmail: getEnv("SUPER_ADMIN_EMAIL"),
  superAdminPassword: getEnv("SUPER_ADMIN_PASSWORD"),
  superAdminName: getEnv("SUPER_ADMIN_NAME", "Super Administrator"),

  // Redis
  redisUrl: getEnv("REDIS_URL", "redis://localhost:6379"),
  redisDb: parseInt(getEnv("REDIS_DB", "0"), 10),

  // Face Engine
  faceEngineUrl: getEnv("FACE_ENGINE_URL", "http://localhost:8001"),
  faceEngineTimeout: parseInt(getEnv("FACE_ENGINE_TIMEOUT", "10000"), 10),
  engineApiKey: getEnv("ENGINE_API_KEY"),

  // Logging
  logLevel: getEnv("LOG_LEVEL", "info"),
  logFormat: getEnv("LOG_FORMAT", "json"),

  // CORS
  corsOrigin: getEnv("CORS_ORIGIN", "http://localhost:3001").split(","),

  // Fraud Frames
  fraudFramesStoragePath: getEnv("FRAUD_FRAMES_STORAGE_PATH", "./fraud_frames"),
  fraudRetentionHours: parseInt(getEnv("FRAUD_RETENTION_HOURS", "24"), 10),

  // Fotos de perfil e logos — sem expiração, ao contrário dos fraud frames.
  // Em deploy sem volume persistente as imagens somem no redeploy.
  profilePhotosStoragePath: getEnv("PROFILE_PHOTOS_STORAGE_PATH", "./profile_photos"),

  // SMTP
  smtpHost: getEnv("SMTP_HOST", "localhost"),
  smtpPort: parseInt(getEnv("SMTP_PORT", "587"), 10),
  smtpSecure: getEnvOptional("SMTP_SECURE", "false") === "true",
  smtpUser: getEnvOptional("SMTP_USER"),
  smtpPassword: getEnvOptional("SMTP_PASSWORD"),
  smtpFromEmail: getEnv("SMTP_FROM_EMAIL", "no-reply@Visage.com"),
  smtpFromName: getEnv("SMTP_FROM_NAME", "Visage"),
  // Destinatário das solicitações de demonstração da landing page
  demoNotifyEmail: getEnv("DEMO_NOTIFY_EMAIL", "otavioviniciusads@gmail.com"),

  // Features
  debug: getEnvOptional("DEBUG", "false") === "true",

  // QR Code de consentimento (CPF cifrado)
  qrSecretKey: getEnv("QR_SECRET_KEY"),
};

// Validate critical env vars on startup
export function validateConfig(): void {
  const required = [
    "DATABASE_URL",
    "MASTER_KEY",
    "JWT_SECRET",
    "SUPER_ADMIN_EMAIL",
    "SUPER_ADMIN_PASSWORD",
    "QR_SECRET_KEY",
    "ENGINE_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error({ missing }, "Missing required environment variables");
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  // Validate MASTER_KEY length (should be 64 hex chars = 32 bytes)
  if (process.env.MASTER_KEY!.length !== 64) {
    throw new Error("MASTER_KEY must be 64 hex characters (32 bytes)");
  }

  // Validate QR_SECRET_KEY length (must be 64 hex chars = 32 bytes)
  if (process.env.QR_SECRET_KEY!.length !== 64) {
    throw new Error("QR_SECRET_KEY must be 64 hex characters (32 bytes)");
  }

  logger.info("Configuration validated successfully");
}
