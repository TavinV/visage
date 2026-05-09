/**
 * Validation middleware
 * Valida request body contra schema Zod
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { logger } from "../lib/logger";

export function validate<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          error: "Validation failed",
          code: "validation_error",
          issues,
        });
        return;
      }

      logger.error({ error }, "Validation error");
      res.status(500).json({
        error: "Internal server error",
        code: "internal_error",
      });
    }
  };
}
