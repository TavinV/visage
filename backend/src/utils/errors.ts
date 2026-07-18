/**
 * HTTP Error Classes
 */

export interface HttpError extends Error {
  status: number;
  code: string;
}

export class NotFoundError extends Error implements HttpError {
  status = 404;
  code = "not_found";

  constructor(message: string = "Resource not found", code?: string) {
    super(message);
    this.name = "NotFoundError";
    if (code) this.code = code;
  }
}

export class ValidationError extends Error implements HttpError {
  status = 400;
  code = "validation_error";

  constructor(message: string = "Validation failed", code?: string) {
    super(message);
    this.name = "ValidationError";
    if (code) this.code = code;
  }
}

export class UnauthorizedError extends Error implements HttpError {
  status = 401;
  code = "unauthorized";

  constructor(message: string = "Unauthorized", code?: string) {
    super(message);
    this.name = "UnauthorizedError";
    if (code) this.code = code;
  }
}

export class ForbiddenError extends Error implements HttpError {
  status = 403;
  code = "forbidden";

  constructor(message: string = "Forbidden", code?: string) {
    super(message);
    this.name = "ForbiddenError";
    if (code) this.code = code;
  }
}

export class ConflictError extends Error implements HttpError {
  status = 409;
  code = "conflict";

  constructor(message: string = "Conflict", code?: string) {
    super(message);
    this.name = "ConflictError";
    if (code) this.code = code;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    "status" in error &&
    "code" in error &&
    typeof (error as any).status === "number" &&
    typeof (error as any).code === "string"
  );
}
