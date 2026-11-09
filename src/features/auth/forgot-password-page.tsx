import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/shared/password";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey } from "./auth-error";

const resetSchema = codeFormSchema.extend({ password: passwordSchema });

/**
 * Forgot password: the email, then the emailed code and a new password.
 * The reset signs every device out; the new password then signs this one in.
 */
export function ForgotPasswordPage({ redirect }: { redirect?: string }) {
  const t = useTranslations("forgot");
  const [email, setEmail] = useState<string | null>(null);
  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {email === null ? (
        <RequestStep onSent={setEmail} />
      ) : (
        <ResetStep email={email} redirect={redirect} />
      )}
      <Link to="/signin" search={{ redirect }} className="text-sm underline">
        {t("back")}
      </Link>
    </main>
  );
}

function RequestStep({ onSent }: { onSent: (email: string) => void }) {
  const t = useTranslations("forgot");
  const signin = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.requestPasswordReset(
        { email: value.email }
      );
      if (failure) setError(signin(authErrorKey(failure)));
      else onSent(value.email);
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{signin("emailLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("send")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function ResetStep({ email, redirect }: { email: string; redirect?: string }) {
  const t = useTranslations("forgot");
  const signin = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { code: "", password: "" },
    validators: { onSubmit: resetSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.resetPassword({
        email,
        otp: value.code.trim(),
        password: value.password,
      });
      if (failure) {
        setError(signin(authErrorKey(failure)));
        return;
      }
      const { error: signInFailure } = await authClient.signIn.email({
        email,
        password: value.password,
      });
      if (signInFailure) setError(signin(authErrorKey(signInFailure)));
      else await afterSignIn(redirect);
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("sentTo", { email })}</p>
      <form.Field name="code">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{signin("codeLabel")}</Label>
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
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("newPassword")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="new-password"
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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("reset")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
