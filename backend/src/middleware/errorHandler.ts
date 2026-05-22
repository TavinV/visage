/**
 * Error handling middleware
 */

import { Request, Response, NextFunction } from "express";
import { isHttpError } from "../utils/errors";
import { logger } from "../lib/logger";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Tratar SyntaxError do body-parser (JSON parsing)
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: "Invalid JSON in request body",
      code: "invalid_json",
    });
    return;
  }

  if (isHttpError(error)) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, "Unhandled error");
  } else {
    logger.error({ error }, "Unknown error");
  }

  res.status(500).json({
    error: "Internal server error",
    code: "internal_error",
  });
}

