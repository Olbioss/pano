import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authErrorKey,
  githubErrorKey,
  passkeyCancelled,
} from "@/features/auth/auth-error";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions, setFirstPassword, updateMe } from "@/lib/session";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { passwordSchema } from "@/shared/password";
import { updateMeSchema } from "@/shared/schemas";
import { deviceName } from "./device-name";

/** The account's sign-ins, as Better Auth lists them. */
const accountsQuery = {
  queryKey: ["account", "sign-ins"],
  queryFn: async () => {
    const { data, error } = await authClient.listAccounts();
    if (error) throw error;
    return data;
  },
} as const;

const passkeysQuery = {
  queryKey: ["account", "passkeys"],
  queryFn: async () => {
    const { data, error } = await authClient.passkey.listUserPasskeys();
    if (error) throw error;
    return data;
  },
} as const;

type Me = { email: string; name: string; sessionStartedAt: string };

/**
 * The signed-in person's name and ways to sign in: a password, passkeys and
 * GitHub. Email codes always work, so nothing here can lock anyone out.
 * `error` is what connecting GitHub came back with.
 */
export function AccountPage({ error }: { error?: string }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  if (!user) return null;
  const demo = isDemoEmail(user.email);
  return (
    <main className="mx-6 my-12 flex flex-col gap-6 sm:mx-auto sm:max-w-lg">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        {!demo && (
          <p className="text-muted-foreground text-sm">
            {t("signedInAs", { email: user.email })}
          </p>
        )}
      </header>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {signin(githubErrorKey(error))}
        </p>
      )}
      {demo ? (
        <p className="paper p-4 text-sm">{t("demo")}</p>
      ) : (
        <>
          <NameSection user={user} />
          <PasswordSection user={user} />
          <PasskeysSection user={user} />
          {me.data?.signIn.github && <GitHubSection user={user} />}
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="paper flex flex-col gap-3 p-5">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** In place of a control that adds or removes a way to sign in. */
function SignInAgain() {
  const t = useTranslations("account");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function signInAgain() {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: "/signin", search: { redirect: "/account" } });
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground text-sm">{t("signInAgain")}</p>
      <Button type="button" variant="outline" size="sm" onClick={signInAgain}>
        {t("signInAgainButton")}
      </Button>
    </div>
  );
}

function Message({
  error,
  done,
}: {
  error: string | null;
  done: string | null;
}) {
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error}
      </p>
    );
  }
  return done ? (
    <p className="text-sm" role="status">
      {done}
    </p>
  ) : null;
}

function NameSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: user.name },
    validators: { onSubmit: updateMeSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      setDone(null);
      try {
        await updateMe(value.name);
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        setDone(t("saved"));
      } catch {
        setError(signin("somethingWrong"));
      }
    },
  });
  return (
    <Section title={t("nameHeading")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-name">{t("nameHeading")}</Label>
              <Input
                id="account-name"
                name={field.name}
                autoComplete="name"
                aria-describedby="account-name-help"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p
                id="account-name-help"
                className="text-muted-foreground text-xs"
              >
                {t("nameHelp")}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <Message error={error} done={done} />
        <Button type="submit" className="self-start">
          {t("save")}
        </Button>
      </form>
    </Section>
  );
}

function PasswordSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const accounts = useQuery(accountsQuery);
  if (!accounts.data) return null;
  const hasPassword = accounts.data.some(
    (account) => account.providerId === "credential"
  );
  return (
    <Section title={t("passwordHeading")}>
      {hasPassword ? (
        <ChangePassword />
      ) : isSessionFresh(user.sessionStartedAt) ? (
        <SetPassword />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t("noPassword")}</p>
          <SignInAgain />
        </>
      )}
    </Section>
  );
}

function SetPassword() {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: z.object({ password: passwordSchema }) },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await setFirstPassword(value.password);
        setDone(t("passwordSet"));
        await queryClient.invalidateQueries({
          queryKey: accountsQuery.queryKey,
        });
      } catch (failure) {
        setError(
          signin(
            authErrorKey(failure instanceof ApiError ? failure : { status: 0 })
          )
        );
      }
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("noPassword")}</p>
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
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
      <Message error={error} done={done} />
      <Button type="submit" className="self-start">
        {t("setPassword")}
      </Button>
    </form>
  );
}

function ChangePassword() {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: {
      onSubmit: z.object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      setDone(null);
      const { error: failure } = await authClient.changePassword({
        ...value,
        revokeOtherSessions: true,
      });
      if (failure) {
        setError(signin(authErrorKey(failure)));
        return;
      }
      formApi.reset();
      setDone(t("passwordChanged"));
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="currentPassword">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">{t("currentPassword")}</Label>
            <Input
              id="current-password"
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
      <form.Field name="newPassword">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
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
      <Message error={error} done={done} />
      <Button type="submit" className="self-start">
        {t("changePassword")}
      </Button>
    </form>
  );
}

function PasskeysSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const passkeys = useQuery(passkeysQuery);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof PublicKeyCredential !== "undefined";
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey });

  async function add() {
    setError(null);
    const { error: failure } = await authClient.passkey.addPasskey({
      name: deviceName(navigator.userAgent),
    });
    if (failure && !passkeyCancelled(failure)) {
      setError(signin(authErrorKey(failure)));
    }
    await refresh();
  }

  async function remove(id: string) {
    setError(null);
    const { error: failure } = await authClient.passkey.deletePasskey({ id });
    if (failure) setError(signin(authErrorKey(failure)));
    await refresh();
  }

  return (
    <Section title={t("passkeysHeading")}>
      <p className="text-muted-foreground text-sm">{t("passkeysHelp")}</p>
      {passkeys.data?.length ? (
        <ul className="flex flex-col divide-y">
          {passkeys.data.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="flex flex-col">
                <span className="font-medium text-sm">
                  {passkey.name ?? deviceName("")}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("addedOn", {
                    date: format.dateTime(new Date(passkey.createdAt), {
                      dateStyle: "medium",
                    }),
                  })}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => remove(passkey.id)}
              >
                {t("removePasskey")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t("noPasskeys")}</p>
      )}
      <Message error={error} done={null} />
      {!supported ? (
        <p className="text-muted-foreground text-sm">{t("noWebAuthn")}</p>
      ) : isSessionFresh(user.sessionStartedAt) ? (
        <Button type="button" className="self-start" onClick={add}>
          {t("addPasskey")}
        </Button>
      ) : (
        <SignInAgain />
      )}
    </Section>
  );
}

function GitHubSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const [error, setError] = useState<string | null>(null);
  if (!accounts.data) return null;
  const github = accounts.data.find(
    (account) => account.providerId === "github"
  );
  const fresh = isSessionFresh(user.sessionStartedAt);

  async function connect() {
    await authClient.linkSocial({
      provider: "github",
      callbackURL: "/account",
      errorCallbackURL: "/account",
    });
  }

  async function disconnect(accountId: string) {
    setError(null);
    const { error: failure } = await authClient.unlinkAccount({ accountId });
    if (failure) setError(signin(authErrorKey(failure)));
    await queryClient.invalidateQueries({ queryKey: accountsQuery.queryKey });
  }

  return (
    <Section title={t("githubHeading")}>
      <p className="text-sm">
        {github ? t("githubConnected") : t("githubNotConnected")}
      </p>
      <Message error={error} done={null} />
      {!fresh ? (
        <SignInAgain />
      ) : github ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => disconnect(github.id)}
        >
          {t("disconnectGitHub")}
        </Button>
      ) : (
        <Button type="button" className="self-start" onClick={connect}>
          {t("connectGitHub")}
        </Button>
      )}
    </Section>
  );
}
