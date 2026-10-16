import type { ApiErrorCode } from "@/shared/envelope";
import { type FieldErrorKey, isFieldErrorKey } from "@/shared/field-errors";
import { ApiError } from "./api";

/** The `errors.*` message for a failed request. */
export function apiErrorKey(error: unknown): ApiErrorCode | "NETWORK" {
  return error instanceof ApiError ? error.code : "NETWORK";
}

/** The `fieldErrors.*` key behind a field message, if it's one of ours. */
export function fieldErrorKey(message: string): FieldErrorKey | null {
  return isFieldErrorKey(message) ? message : null;
}
