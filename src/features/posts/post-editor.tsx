import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { updatePost } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";
import { postFormSchema } from "@/shared/schemas";

export function PostEditor({
  post,
  onDone,
}: {
  post: PostDetail;
  onDone: () => void;
}) {
  const t = useTranslations("post");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { title: post.title, body: post.body },
    validators: { onSubmit: postFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const updated = await updatePost(post.id, value);
        qc.setQueryData(postKeys.detail(post.id), updated);
        await qc.invalidateQueries({
          queryKey: postKeys.feeds(post.workspace.slug),
        });
        onDone();
        // A new title means a new address; the old one keeps redirecting.
        if (updated.ref !== post.ref) {
          await navigate({
            to: "/p/$ref",
            params: { ref: updated.ref },
            replace: true,
          });
        }
      } catch (err) {
        setError(tErrors(apiErrorKey(err)));
      }
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
      <form.Field name="title">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-title">{t("titleLabel")}</Label>
            <Input
              id="post-title"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="body">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-body">{t("bodyLabel")}</Label>
            <Textarea
              id="post-body"
              name={field.name}
              rows={6}
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
            <Button type="submit" disabled={isSubmitting}>
              {t("save")}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
