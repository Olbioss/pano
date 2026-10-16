import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorCode, ErrorResponse } from "@/shared/envelope";

/**
 * Throw from a route to answer with a specific status and a stable code the
 * UI can translate. `fields` carries per-field messages for forms.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}

export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json<ErrorResponse>(
      {
        success: false,
        code: err.code,
        error: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
      err.status
    );
  }
  if (err instanceof HTTPException) {
    return c.json<ErrorResponse>(
      {
        success: false,
        code: codeForStatus(err.status),
        error: err.message || "Request failed",
      },
      err.status
    );
  }
  // Anything else is a bug or an outage. Log it for Workers observability and
  // keep its details (SQL, hosts, connection strings) out of the response.
  console.error(err);
  return c.json<ErrorResponse>(
    { success: false, code: "INTERNAL_ERROR", error: "Internal Server Error" },
    500
  );
};

export const handleNotFound: NotFoundHandler = (c) =>
  c.json<ErrorResponse>(
    { success: false, code: "NOT_FOUND", error: "Not found" },
    404
  );
