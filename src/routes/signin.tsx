import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";

export const Route = createFileRoute("/signin")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: SignIn,
});

function SignIn() {
  const t = useTranslations("signin");
  const [email, setEmail] = useState<string | null>(null);
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {email === null ? (
        <EmailStep onSent={setEmail} />
      ) : (
        <CodeStep email={email} onBack={() => setEmail(null)} />
      )}
    </main>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
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
        setError(failure.status === 429 ? t("tooManyCodes") : t("sendFailed"));
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

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const t = useTranslations("signin");
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({
        queryKey: meQueryOptions.queryKey,
      });
      const redirect = safeRedirect(search.redirect);
      if (redirect) router.history.push(redirect);
      else await navigate({ to: "/" });
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
