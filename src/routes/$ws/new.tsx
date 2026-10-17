import { useForm } from "@tanstack/react-form";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFormSchema } from "@/features/submit/form-schema";
import { SimilarPanel } from "@/features/submit/similar-panel";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { createPost } from "@/lib/posts";
import { meQueryOptions, updateMe } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/new")({
  validateSearch: z.object({ board: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
  },
  component: NewRequest,
});

function NewRequest() {
  const { ws } = Route.useParams();
  const search = Route.useSearch();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const t = useTranslations("submit");
  const tPost = useTranslations("post");
  const tWorkspace = useTranslations("workspace");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currentName = me.user?.name ?? "";
  // Ask for a name while the person has none; afterwards only on request.
  const [askName, setAskName] = useState(currentName === "");
  const [formError, setFormError] = useState<string | null>(null);
  const submitted = useRef(false);
  const schema = useMemo(() => submitFormSchema(askName), [askName]);
  const startBoard =
    workspace.boards.find((board) => board.slug === search.board) ??
    workspace.boards[0];

  const form = useForm({
    defaultValues: {
      name: currentName,
      boardId: startBoard?.id ?? "",
      title: "",
      body: "",
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (askName && value.name.trim() !== currentName) {
          await updateMe(value.name);
          await qc.invalidateQueries({ queryKey: meQueryOptions.queryKey });
        }
        const post = await createPost(ws, {
          boardId: value.boardId,
          title: value.title,
          body: value.body,
        });
        submitted.current = true;
        qc.setQueryData(postKeys.detail(post.id), post);
        await qc.invalidateQueries({ queryKey: postKeys.feeds(ws) });
        await navigate({ to: "/p/$ref", params: { ref: post.ref } });
      } catch (error) {
        setFormError(tErrors(apiErrorKey(error)));
      }
    },
  });

  // A typed draft is easy to lose by following a link; ask first.
  useBlocker({
    shouldBlockFn: () => {
      if (submitted.current || !form.state.isDirty) return false;
      return !window.confirm(t("leaveConfirm"));
    },
    enableBeforeUnload: () => !submitted.current && form.state.isDirty,
  });

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{tWorkspace("noBoards")}</p>;
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-xl">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {askName ? (
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="submit-name">{t("nameLabel")}</Label>
                <Input
                  id="submit-name"
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
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("postingAs", { name: currentName })}{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setAskName(true)}
            >
              {t("changeName")}
            </Button>
          </p>
        )}
        <form.Field name="boardId">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-board">{t("boardLabel")}</Label>
              <select
                id="submit-board"
                name={field.name}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                {workspace.boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
        <form.Field name="title">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-title">{tPost("titleLabel")}</Label>
              <Input
                id="submit-title"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
              <SimilarPanel workspace={ws} title={field.state.value} />
            </div>
          )}
        </form.Field>
        <form.Field name="body">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-body">{tPost("bodyLabel")}</Label>
              <Textarea
                id="submit-body"
                name={field.name}
                rows={6}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {tPost("bodyHint")}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {t("submit")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  );
}
