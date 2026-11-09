import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/session";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey, githubErrorKey, passkeyCancelled } from "./auth-error";
import { CodeSignIn } from "./code-sign-in";
import { ConfirmStep } from "./confirm-step";

const passwordSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Sign in to Pano: a password by default, an emailed code instead, a passkey
 * or GitHub. `error` is what GitHub sign-in came back with.
 */
export function SignInPage({
  redirect,
  error,
}: {
  redirect?: string;
  error?: string;
}) {
  const t = useTranslations("signin");
  const [mode, setMode] = useState<"password" | "code">("password");
  const [confirming, setConfirming] = useState<{
    email: string;
    password: string;
  } | null>(null);

  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {t(githubErrorKey(error))}
        </p>
      )}
      {confirming ? (
        <ConfirmStep {...confirming} redirect={redirect} />
      ) : mode === "password" ? (
        <>
          <PasswordSignIn redirect={redirect} onUnconfirmed={setConfirming} />
          <Button type="button" variant="link" onClick={() => setMode("code")}>
            {t("useCode")}
          </Button>
        </>
      ) : (
        <>
          <CodeSignIn redirect={redirect} />
          <Button
            type="button"
            variant="link"
            onClick={() => setMode("password")}
          >
            {t("usePassword")}
          </Button>
        </>
      )}
      <OtherWays redirect={redirect} />
      <p className="text-muted-foreground text-sm">
        {t("newHere")}{" "}
        <Link to="/signup" search={{ redirect }} className="underline">
          {t("createAccount")}
        </Link>
      </p>
    </main>
  );
}

function PasswordSignIn({
  redirect,
  onUnconfirmed,
}: {
  redirect?: string;
  onUnconfirmed: (account: { email: string; password: string }) => void;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: passwordSignInSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      setUnconfirmed(false);
      const { error: failure } = await authClient.signIn.email(value);
      if (!failure) {
        await afterSignIn(redirect);
        return;
      }
      if (failure.code === "EMAIL_NOT_VERIFIED") setUnconfirmed(true);
      else setError(t(authErrorKey(failure)));
    },
  });

  // "Send a new code": signing up again with the same password replaces the
  // waiting sign-up and emails a fresh code.
  async function sendNewCode() {
    const { email, password } = form.state.values;
    const { error: failure } = await authClient.signUp.email({
      email,
      password,
      name: "",
    });
    if (failure) setError(t(authErrorKey(failure)));
    else onUnconfirmed({ email, password });
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
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("emailLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              // "webauthn" lets the browser offer saved passkeys here.
              autoComplete="username webauthn"
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
            <div className="flex items-baseline justify-between">
              <Label htmlFor={field.name}>{t("passwordLabel")}</Label>
              <Link
                to="/forgot-password"
                search={{ redirect }}
                className="text-sm underline"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="current-password"
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
      {unconfirmed && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm">{t("confirmFirst")}</p>
          <Button type="button" variant="outline" onClick={sendNewCode}>
            {t("sendNewCode")}
          </Button>
        </div>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("verify")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

/** A passkey, and GitHub when the server has it set up. */
function OtherWays({ redirect }: { redirect?: string }) {
  const t = useTranslations("signin");
  const me = useQuery(meQueryOptions);
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);

  // Browsers that can offer saved passkeys in the email field's suggestions
  // wait for the person to pick one there.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!(await conditionalPasskeys())) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (active && data) await afterSignIn(redirect);
    })();
    return () => {
      active = false;
    };
  }, [afterSignIn, redirect]);

  async function signInWithPasskey() {
    setError(null);
    const { error: failure } = await authClient.signIn.passkey();
    if (!failure) await afterSignIn(redirect);
    else if (!passkeyCancelled(failure)) setError(t("passkeyFailed"));
  }

  async function signInWithGitHub() {
    // GitHub sends the browser back here; signed in, this page moves on.
    const back = redirect
      ? `/signin?redirect=${encodeURIComponent(redirect)}`
      : "/signin";
    await authClient.signIn.social({
      provider: "github",
      callbackURL: back,
      errorCallbackURL: "/signin",
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <p className="text-muted-foreground text-sm">{t("otherWays")}</p>
      <Button type="button" variant="outline" onClick={signInWithPasskey}>
        {t("passkey")}
      </Button>
      {me.data?.signIn.github && (
        <Button type="button" variant="outline" onClick={signInWithGitHub}>
          {t("github")}
        </Button>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

async function conditionalPasskeys() {
  if (typeof PublicKeyCredential === "undefined") return false;
  return (
    (await PublicKeyCredential.isConditionalMediationAvailable?.()) ?? false
  );
}
