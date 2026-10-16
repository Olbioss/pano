import { useTranslations } from "use-intl";
import { fieldErrorKey } from "@/lib/error-text";

/** A field's first problem, translated when it's one of our keys. */
export function FieldError({ errors }: { errors: unknown[] }) {
  const t = useTranslations("fieldErrors");
  const first = errors[0];
  if (!first) return null;
  const message =
    typeof first === "string"
      ? first
      : ((first as { message?: string }).message ?? "");
  const key = fieldErrorKey(message);
  return (
    <p className="text-destructive text-sm" role="alert">
      {key ? t(key) : message}
    </p>
  );
}
