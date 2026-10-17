/**
 * The JSON shape every /api response uses. Success carries `data`. Failure
 * carries a stable `code` the UI translates, an English `error` for logs and
 * developers, and optional per-field messages for forms.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "WORKSPACE_LIMIT"
  | "POST_MERGED";

export type SuccessResponse<T> = { success: true; data: T };

export type ErrorResponse = {
  success: false;
  code: ApiErrorCode;
  error: string;
  fields?: Record<string, string>;
};

export function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { error?: unknown }).error === "string"
  );
}
