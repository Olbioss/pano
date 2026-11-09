import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/shared/password";
import { authErrorKey } from "./auth-error";
import { ConfirmStep } from "./confirm-step";

const signUpSchema = z.object({ email: z.email(), password: passwordSchema });

/** Create an account: an email and a password, then the emailed code. */
export function SignUpPage({ redirect }: { redirect?: string }) {
  const t = useTranslations("signup");
  const signin = useTranslations("signin");
  const [account, setAccount] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.signUp.email({
        ...value,
        name: "",
      });
      if (failure) setError(signin(authErrorKey(failure)));
      else setAccount(value);
    },
  });

  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {account ? (
        <ConfirmStep {...account} redirect={redirect} />
      ) : (
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
          <form.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{signin("passwordLabel")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  aria-describedby="password-hint"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p id="password-hint" className="text-muted-foreground text-xs">
                  {t("passwordHint")}
                </p>
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
                {t("create")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
      <p className="text-muted-foreground text-sm">
        {t("haveAccount")}{" "}
        <Link to="/signin" search={{ redirect }} className="underline">
          {t("signIn")}
        </Link>
      </p>
    </main>
  );
}
