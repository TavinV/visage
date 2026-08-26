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

  // Corpo maior que o limite configurado (express.json({ limit })) — o
  // body-parser lança PayloadTooLargeError com .status/.type setados, mas
  // não é uma instância de erro custom da aplicação, então precisa de
  // tratamento explícito antes de cair no 500 genérico.
  if (
    error instanceof Error &&
    (error as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      error: "Payload too large",
      code: "payload_too_large",
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

