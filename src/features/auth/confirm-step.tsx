import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { codeFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey } from "./auth-error";

/**
 * Asks for a new account's confirmation code. The code goes back with the
 * password typed a step earlier: without it the server confirms the address
 * but keeps no password, so someone who signed up with another person's
 * address never ends up with a way into their account.
 */
export function ConfirmStep({
  email,
  password,
  redirect,
}: {
  email: string;
  password: string;
  redirect?: string;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: codeFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.$fetch(
        "/email-otp/verify-email",
        {
          method: "POST",
          body: { email, otp: value.code.trim(), password },
        }
      );
      if (failure) {
        setError(t(authErrorKey(failure)));
        return;
      }
      await afterSignIn(redirect);
    },
  });

  // A new code comes from signing up again: it replaces the sign-up that
  // was waiting, with the same password.
  async function sendNewCode() {
    setError(null);
    setResent(false);
    const { error: failure } = await authClient.signUp.email({
      email,
      password,
      name: "",
    });
    if (failure) setError(t(authErrorKey(failure)));
    else setResent(true);
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">
        {t("confirmSentTo", { email })}
      </p>
      <form.Field name="code">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("codeLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {resent && (
        <p className="text-sm" role="status">
          {t("newCodeSent")}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("confirm")}
          </Button>
        )}
      </form.Subscribe>
      <Button type="button" variant="link" onClick={sendNewCode}>
        {t("sendNewCode")}
      </Button>
    </form>
  );
}
