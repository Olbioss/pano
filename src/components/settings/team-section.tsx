import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import {
  cancelInvitation,
  changeRole,
  invite,
  removeFromTeam,
  resendInvitation,
  teamQueryOptions,
} from "@/lib/team";
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  managesTeam,
  type PendingInvitation,
  type SentInvitation,
  type TeamMember,
} from "@/shared/team";

type Message = { tone: "ok" | "error"; text: string };
type Report = (message: Message) => void;

/**
 * Settings → Team. Everyone on the team sees who's on it and who's been
 * invited; owners and admins invite, change roles and remove people; anyone
 * but the owner can leave.
 */
export function TeamSection({
  slug,
  viewerId,
  viewerRole,
}: {
  slug: string;
  viewerId: string;
  viewerRole: string;
}) {
  const t = useTranslations("team");
  const team = useQuery(teamQueryOptions(slug));
  const [message, setMessage] = useState<Message | null>(null);
  const manages = managesTeam(viewerRole);

  if (team.isPending) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (team.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t("loadFailed")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {manages && <InviteForm slug={slug} report={setMessage} />}
      {message && (
        <p
          className={
            message.tone === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      <section aria-labelledby="team-members" className="flex flex-col gap-2">
        <h3 id="team-members" className="font-semibold">
          {t("members")}
        </h3>
        <ul className="flex flex-col divide-y rounded-md border">
          {team.data.members.map((member) => (
            <MemberRow
              key={member.userId}
              slug={slug}
              member={member}
              isYou={member.userId === viewerId}
              manages={manages}
              report={setMessage}
            />
          ))}
        </ul>
      </section>
      {team.data.invitations.length > 0 && (
        <section aria-labelledby="team-pending" className="flex flex-col gap-2">
          <h3 id="team-pending" className="font-semibold">
            {t("pending")}
          </h3>
          <ul className="flex flex-col divide-y rounded-md border">
            {team.data.invitations.map((invitation) => (
              <PendingRow
                key={invitation.id}
                slug={slug}
                invitation={invitation}
                manages={manages}
                report={setMessage}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** What to say about an invitation that went out, or didn't. */
function useSentText() {
  const t = useTranslations("team");
  return (sent: SentInvitation, again = false): Message =>
    sent.emailSent
      ? {
          tone: "ok",
          text: t(again ? "resent" : "invited", {
            email: sent.invitation.email,
          }),
        }
      : { tone: "error", text: t("notSent", { email: sent.invitation.email }) };
}

function useErrorText() {
  const t = useTranslations("team");
  const tErrors = useTranslations("errors");
  return (error: unknown): Message => ({
    tone: "error",
    text:
      error instanceof ApiError && error.fields?.email
        ? t("invalidEmail")
        : tErrors(apiErrorKey(error)),
  });
}

function useRefreshTeam(slug: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: teamQueryOptions(slug).queryKey,
    });
}

function RoleSelect({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** For a select without a visible label. */
  label?: string;
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean;
}) {
  const tRoles = useTranslations("team.roles");
  return (
    <select
      id={id}
      aria-label={label}
      className="h-9 rounded-md border bg-transparent px-2 text-sm"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as AssignableRole)}
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <option key={role} value={role}>
          {tRoles(role)}
        </option>
      ))}
    </select>
  );
}

function InviteForm({ slug, report }: { slug: string; report: Report }) {
  const t = useTranslations("team");
  const sentText = useSentText();
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const send = useMutation({
    mutationFn: () => invite(slug, { email: email.trim(), role }),
    onSuccess: async (sent) => {
      report(sentText(sent));
      setEmail("");
      await refresh();
    },
    onError: (error) => report(errorText(error)),
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate();
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <Label htmlFor="invite-email">{t("emailLabel")}</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invite-role">{t("roleLabel")}</Label>
        <RoleSelect id="invite-role" value={role} onChange={setRole} />
      </div>
      <Button type="submit" disabled={send.isPending || email.trim() === ""}>
        {t("invite")}
      </Button>
    </form>
  );
}

function MemberRow({
  slug,
  member,
  isYou,
  manages,
  report,
}: {
  slug: string;
  member: TeamMember;
  isYou: boolean;
  manages: boolean;
  report: Report;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const name = member.name || member.email || t("anonymous");
  const label = isYou ? t("you", { name }) : name;
  const setRole = useMutation({
    mutationFn: (role: AssignableRole) => changeRole(slug, member.userId, role),
    onSuccess: refresh,
    onError: (error) => report(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: () => removeFromTeam(slug, member.userId),
    onSuccess: async () => {
      if (isYou) {
        // Off the team: settings aren't yours any more.
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        await navigate({ to: "/$ws", params: { ws: slug } });
        return;
      }
      await refresh();
    },
    onError: (error) => {
      setConfirming(false);
      report(errorText(error));
    },
  });
  const canChange = member.role !== "owner" && (manages || isYou);

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">{label}</span>
        {member.email && member.name && (
          <span className="truncate text-muted-foreground text-xs">
            {member.email}
          </span>
        )}
      </div>
      {manages && member.role !== "owner" ? (
        <RoleSelect
          id={`role-${member.userId}`}
          label={t("roleFor", { name })}
          value={member.role === "admin" ? "admin" : "member"}
          disabled={setRole.isPending}
          onChange={(role) => setRole.mutate(role)}
        />
      ) : (
        <span className="text-muted-foreground text-sm">
          {tRoles(member.role)}
        </span>
      )}
      {canChange &&
        (confirming ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {isYou ? t("confirmLeave") : t("confirmRemove")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={isYou ? undefined : t("removeLabel", { name })}
            onClick={() => setConfirming(true)}
          >
            {isYou ? t("leave") : t("remove")}
          </Button>
        ))}
    </li>
  );
}

function PendingRow({
  slug,
  invitation,
  manages,
  report,
}: {
  slug: string;
  invitation: PendingInvitation;
  manages: boolean;
  report: Report;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const format = useFormatter();
  const now = useNow();
  const sentText = useSentText();
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const expiresAt = new Date(invitation.expiresAt);
  const resend = useMutation({
    mutationFn: () => resendInvitation(slug, invitation.id),
    onSuccess: async (sent) => {
      report(sentText(sent, true));
      await refresh();
    },
    onError: (error) => report(errorText(error)),
  });
  const cancel = useMutation({
    mutationFn: () => cancelInvitation(slug, invitation.id),
    onSuccess: refresh,
    onError: (error) => report(errorText(error)),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{invitation.email}</span>
        <span className="text-muted-foreground text-xs">
          {tRoles(invitation.role)} ·{" "}
          {expiresAt < now
            ? t("expired")
            : t("expires", {
                date: format.dateTime(expiresAt, {
                  day: "numeric",
                  month: "long",
                }),
              })}
        </span>
      </div>
      {manages && (
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("resendLabel", { email: invitation.email })}
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {t("resend")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("cancelLabel", { email: invitation.email })}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t("cancel")}
          </Button>
        </>
      )}
    </li>
  );
}
