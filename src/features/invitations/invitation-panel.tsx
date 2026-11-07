import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { apiErrorKey } from "@/lib/error-text";
import { acceptInvitation, invitationQueryOptions } from "@/lib/invitations";
import { meQueryOptions } from "@/lib/session";
import type { InvitationView } from "@/shared/invitations";

/**
 * /invite/<id>: who's inviting, to what, as what, and the one thing to do
 * next, which depends on who's signed in.
 */
export function InvitationPanel({ id }: { id: string }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const me = useQuery(meQueryOptions);
  // Asked once Pano knows who's signed in: the answer depends on it.
  const invitation = useQuery({
    ...invitationQueryOptions(id, me.data?.user?.id ?? null),
    enabled: !me.isPending,
  });
  if (invitation.isPending || me.isPending) {
    return (
      <>
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </>
    );
  }
  if (invitation.isError) {
    const gone =
      invitation.error instanceof ApiError && invitation.error.status === 404;
    return (
      <>
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-sm" role="alert">
          {gone
            ? tErrors("INVITATION_NOT_FOUND")
            : tErrors(apiErrorKey(invitation.error))}
        </p>
      </>
    );
  }
  return (
    <InvitationDetails
      invitation={invitation.data}
      signedIn={Boolean(me.data?.user)}
    />
  );
}

function InvitationDetails({
  invitation,
  signedIn,
}: {
  invitation: InvitationView;
  signedIn: boolean;
}) {
  const t = useTranslations("invitation");
  const tRoles = useTranslations("invitation.roles");
  const { name, slug } = invitation.workspace;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-semibold text-2xl">
        {t("heading", { inviter: invitation.inviter, workspace: name })}
      </h1>
      <p className="text-muted-foreground text-sm">
        {t("details", {
          role: tRoles(invitation.role),
          email: invitation.email,
        })}
      </p>
      <NextStep invitation={invitation} signedIn={signedIn} />
      {invitation.onTeam && (
        <Link
          to="/$ws"
          params={{ ws: slug }}
          className="text-sm underline underline-offset-4"
        >
          {t("open", { workspace: name })}
        </Link>
      )}
    </div>
  );
}

function NextStep({
  invitation,
  signedIn,
}: {
  invitation: InvitationView;
  signedIn: boolean;
}) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const { name } = invitation.workspace;
  if (invitation.onTeam) {
    return <p className="text-sm">{t("onTeam", { workspace: name })}</p>;
  }
  if (invitation.state === "expired") {
    return <p className="text-sm">{tErrors("INVITATION_EXPIRED")}</p>;
  }
  if (invitation.state !== "pending") {
    return <p className="text-sm">{tErrors("INVITATION_NOT_FOUND")}</p>;
  }
  if (!signedIn) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("signInHint")}</p>
        <Button asChild className="self-start">
          <Link to="/signin" search={{ redirect: `/invite/${invitation.id}` }}>
            {t("signIn")}
          </Link>
        </Button>
      </div>
    );
  }
  if (!invitation.forYou) return <WrongAddress invitation={invitation} />;
  return <JoinButton invitation={invitation} />;
}

function WrongAddress({ invitation }: { invitation: InvitationView }) {
  const t = useTranslations("invitation");
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    // Back to signed out: the page offers sign-in, for the right address.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {t("wrongAddress", { email: invitation.email })}
      </p>
      <Button
        variant="outline"
        className="self-start"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}

function JoinButton({ invitation }: { invitation: InvitationView }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const join = useMutation({
    mutationFn: () => acceptInvitation(invitation.id),
    onSuccess: async ({ slug }) => {
      // On the team now: the header and settings learn it from /api/me.
      await queryClient.invalidateQueries({
        queryKey: meQueryOptions.queryKey,
      });
      await navigate({ to: "/$ws", params: { ws: slug } });
    },
    onError: (err) => setError(tErrors(apiErrorKey(err))),
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={join.isPending}
        onClick={() => join.mutate()}
      >
        {t("join", { workspace: invitation.workspace.name })}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
