export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      detail: this.detail,
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", detail);
  }
}

/**
 * Wrap an API route handler with automatic error handling.
 *
 * @example
 * export const GET = withErrorHandler(async (req) => {
 *   const user = await requireAuth();
 *   return NextResponse.json({ data });
 * });
 */
export function withErrorHandler(
  handler: (request: Request, context?: unknown) => Promise<Response>
) {
  return async (request: Request, context?: unknown): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return Response.json(error.toJSON(), { status: error.statusCode });
      }

      console.error("Unhandled API error:", error);
      return Response.json(
        { error: "Internal server error", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
  };
}
