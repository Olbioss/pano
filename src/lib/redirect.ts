/**
 * Where to send someone after sign-in. Only paths on this site survive;
 * another origin, a protocol-relative URL or a script URL falls back.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
