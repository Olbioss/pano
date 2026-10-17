/**
 * Stable keys that the API and the forms use instead of English messages, so
 * the UI can translate them. Zod's own messages (too short, not an email)
 * already come translated from its locale, so they need no keys.
 */
export const FIELD_ERROR_KEYS = [
  "SLUG_FORMAT",
  "SLUG_RESERVED",
  "SLUG_TAKEN",
  "NAME_NEEDS_LETTERS",
  "BOARD_EXISTS",
  "BOARD_UNKNOWN",
  "ORDER_MISMATCH",
  "NOTHING_TO_UPDATE",
  "CODE_FORMAT",
] as const;

export type FieldErrorKey = (typeof FIELD_ERROR_KEYS)[number];

export function isFieldErrorKey(value: string): value is FieldErrorKey {
  return (FIELD_ERROR_KEYS as readonly string[]).includes(value);
}
