import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions, updateMe } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
import { draftComment } from "./comment-cache";
import { commentFormSchema } from "./form-schema";
import { useThread } from "./thread-context";
import { useAddComment } from "./use-comment-actions";

type Props = {
  /** The comment being answered; null for a new top-level comment. */
  parent: CommentView | null;
  /** Closes a reply box: on Cancel, and once the reply is saved. */
  onClose?: () => void;
};

/**
 * The comment box. Sending empties it and shows the comment at once,
 * greyed out. If saving fails, the comment disappears and its text comes
 * back here. While the account has no name yet, the box asks for one.
 */
export function CommentComposer({ parent, onClose }: Props) {
  const t = useTranslations("comments");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const { post, viewerName } = useThread();
  const add = useAddComment(post.id);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const currentName = viewerName ?? "";
  const needsName = currentName === "";
  const schema = useMemo(() => commentFormSchema(needsName), [needsName]);

  const form = useForm({
    defaultValues: { name: "", body: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      let authorName = currentName;
      if (needsName) {
        try {
          const me = await updateMe(value.name);
          qc.setQueryData(meQueryOptions.queryKey, me);
          authorName = me.user?.name ?? value.name.trim();
        } catch (err) {
          setError(tErrors(apiErrorKey(err)));
          return;
        }
      }
      const draft = draftComment({
        postId: post.id,
        parent,
        body: value.body,
        authorName,
        official: post.isTeam,
      });
      formApi.setFieldValue("body", "");
      add.mutate(draft, {
        onSuccess: () => onClose?.(),
        // Back into the box, unless a new comment is already being typed.
        onError: () => {
          if (formApi.getFieldValue("body") === "") {
            formApi.setFieldValue("body", value.body);
          }
        },
      });
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {needsName && (
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
              <Input
                id={`${id}-name`}
                name={field.name}
                autoComplete="name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t("nameHint")}</p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
      )}
      <form.Field name="body">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-body`}>
              {parent ? t("replyLabel") : t("addLabel")}
            </Label>
            <Textarea
              id={`${id}-body`}
              name={field.name}
              rows={parent ? 3 : 4}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("bodyHint")}</p>
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {parent ? t("submitReply") : t("submit")}
            </Button>
          )}
        </form.Subscribe>
        {onClose && (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

/** What signed-out visitors see instead of the comment box. */
export function SignInToComment() {
  const t = useTranslations("comments");
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <p className="text-sm">
      <Link to="/signin" search={{ redirect: href }} className="underline">
        {t("signInToComment")}
      </Link>
    </p>
  );
}
