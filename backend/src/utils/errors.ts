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

  constructor(message: string = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error implements HttpError {
  status = 400;
  code = "validation_error";

  constructor(message: string = "Validation failed") {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error implements HttpError {
  status = 401;
  code = "unauthorized";

  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error implements HttpError {
  status = 403;
  code = "forbidden";

  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error implements HttpError {
  status = 409;
  code = "conflict";

  constructor(message: string = "Conflict") {
    super(message);
    this.name = "ConflictError";
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
