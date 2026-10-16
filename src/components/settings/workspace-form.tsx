import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import { updateWorkspace, workspaceQueryOptions } from "@/lib/workspaces";
import { LOCALES, type Locale } from "@/shared/locale";
import { localeSchema, workspaceNameSchema } from "@/shared/schemas";

type Props = {
  workspace: { slug: string; name: string; defaultLocale: Locale };
};

type Status = { kind: "saved" } | { kind: "error"; message: string } | null;

// The form always sends both fields, so it validates them as required; the
// PATCH route itself also accepts partial updates.
const settingsFormSchema = z.object({
  name: workspaceNameSchema,
  defaultLocale: localeSchema,
});

export function WorkspaceForm({ workspace }: Props) {
  const t = useTranslations("settings");
  const tNew = useTranslations("newWorkspace");
  const tErrors = useTranslations("errors");
  const tLanguages = useTranslations("languages");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(null);

  const form = useForm({
    defaultValues: {
      name: workspace.name,
      defaultLocale: workspace.defaultLocale,
    },
    validators: { onSubmit: settingsFormSchema },
    onSubmit: async ({ value, formApi }) => {
      setStatus(null);
      try {
        await updateWorkspace(workspace.slug, value);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceQueryOptions(workspace.slug).queryKey,
          }),
          queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
        ]);
        setStatus({ kind: "saved" });
      } catch (error) {
        const nameError =
          error instanceof ApiError ? error.fields?.name : undefined;
        if (nameError) {
          formApi.setFieldMeta("name", (meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onSubmit: nameError },
          }));
          return;
        }
        setStatus({ kind: "error", message: tErrors(apiErrorKey(error)) });
      }
    },
  });

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name">{tNew("nameLabel")}</Label>
            <Input
              id="workspace-name"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="defaultLocale">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-locale">{tNew("localeLabel")}</Label>
            <select
              id="workspace-locale"
              name={field.name}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(event.target.value as Locale)
              }
            >
              {LOCALES.map((option) => (
                <option key={option} value={option}>
                  {tLanguages(option)}
                </option>
              ))}
            </select>
          </div>
        )}
      </form.Field>
      <div className="flex items-center gap-3">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t("save")}
            </Button>
          )}
        </form.Subscribe>
        {status?.kind === "saved" && (
          <output className="text-muted-foreground text-sm">
            {t("saved")}
          </output>
        )}
        {status?.kind === "error" && (
          <p className="text-destructive text-sm" role="alert">
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}
