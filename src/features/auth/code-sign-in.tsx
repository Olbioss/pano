import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { afterRefusedCode } from "@/lib/sign-in-error";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";

/**
 * Sign in with an emailed code: the email, then the code. A new address
 * gets an account the same way.
 */
export function CodeSignIn({ redirect }: { redirect?: string }) {
  const [sent, setSent] = useState<{ email: string; note?: Note } | null>(null);
  return sent === null ? (
    <EmailStep onSent={(email, note) => setSent({ email, note })} />
  ) : (
    <CodeStep
      email={sent.email}
      note={sent.note}
      redirect={redirect}
      onBack={() => setSent(null)}
    />
  );
}

/** Why the code step asks for a code sent earlier. */
type Note = "useLatestCode";

function EmailStep({
  onSent,
}: {
  onSent: (email: string, note?: Note) => void;
}) {
  const t = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.sendVerificationOtp({
        email: value.email,
        type: "sign-in",
      });
      if (failure) {
        const next = afterRefusedCode(failure);
        if (next.step === "code") onSent(value.email, next.note);
        else setError(t(next.error));
        return;
      }
      onSent(value.email);
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
      <p className="text-muted-foreground text-sm">{t("emailIntro")}</p>
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("emailLabel")}</Label>
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
            {t("sendCode")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function CodeStep({
  email,
  note,
  redirect,
  onBack,
}: {
  email: string;
  note?: Note;
  redirect?: string;
  onBack: () => void;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: codeFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.signIn.emailOtp({
        email,
        otp: value.code.trim(),
      });
      if (failure) {
        setError(
          failure.status === 429 ? t("tooManyAttempts") : t("codeInvalid")
        );
        return;
      }
      await afterSignIn(redirect);
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
      <p className="text-muted-foreground text-sm">
        {t("codeSentTo", { email })}
      </p>
      {note && (
        <p className="text-sm" role="status">
          {t(note)}
        </p>
      )}
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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("verify")}
          </Button>
        )}
      </form.Subscribe>
      <Button type="button" variant="link" onClick={onBack}>
        {t("useAnotherEmail")}
      </Button>
    </form>
  );
}
