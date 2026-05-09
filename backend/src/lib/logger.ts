/**
 * Logger — Logging estruturado JSON
 */

import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL || "info";
const logFormat = process.env.LOG_FORMAT || (isDevelopment ? "pretty" : "json");

const transport = isDevelopment && logFormat === "pretty"
  ? pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    })
  : undefined;

export const logger = pino(
  {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

/**
 * Child logger com contexto
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}
