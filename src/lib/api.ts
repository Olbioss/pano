import { hc } from "hono/client";
import {
  type ApiErrorCode,
  isErrorResponse,
  type SuccessResponse,
} from "@/shared/envelope";
import type { AppType } from "../../worker/app";

/** The typed client. Every route and payload comes from the Worker's AppType. */
export const api = hc<AppType>("/").api;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type JsonResponse<T> = {
  ok: boolean;
  status: number;
  json(): Promise<SuccessResponse<T>>;
};

/**
 * Returns `data` from a successful response and throws ApiError otherwise, so
 * a failed request always reaches TanStack Query's onError. An error body
 * that isn't the envelope (a proxy's HTML page, say) still becomes ApiError.
 */
export async function unwrap<T>(res: JsonResponse<T>): Promise<T> {
  if (res.ok) return (await res.json()).data;
  const body: unknown = await res.json().catch(() => null);
  if (isErrorResponse(body)) {
    throw new ApiError(res.status, body.code, body.error, body.fields);
  }
  throw new ApiError(
    res.status,
    "INTERNAL_ERROR",
    `Request failed with status ${res.status}`
  );
}
