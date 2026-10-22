import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import { createWorkspace } from "@/lib/workspaces";
import { LOCALES, type Locale } from "@/shared/locale";
import { createWorkspaceSchema } from "@/shared/schemas";
import { slugify } from "@/shared/slug";

export const Route = createFileRoute("/new-workspace")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
    // One workspace per account: send its owner there instead.
    const existing = me.workspaces[0];
    if (existing) {
      throw redirect({ to: "/$ws", params: { ws: existing.slug } });
    }
  },
  component: NewWorkspace,
});

const FIELDS = ["name", "slug", "defaultLocale"] as const;
type FieldName = (typeof FIELDS)[number];
const isFieldName = (value: string): value is FieldName =>
  (FIELDS as readonly string[]).includes(value);

function NewWorkspace() {
  const t = useTranslations("newWorkspace");
  const tErrors = useTranslations("errors");
  const tLanguages = useTranslations("languages");
  const { locale } = useLocaleControls();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", slug: "", defaultLocale: locale },
    validators: { onSubmit: createWorkspaceSchema },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      try {
        const workspace = await createWorkspace(value);
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        await navigate({ to: "/$ws", params: { ws: workspace.slug } });
      } catch (error) {
        const fields = error instanceof ApiError ? error.fields : undefined;
        if (fields) {
          for (const [name, message] of Object.entries(fields)) {
            if (!isFieldName(name)) continue;
            formApi.setFieldMeta(name, (meta) => ({
              ...meta,
              errorMap: { ...meta.errorMap, onSubmit: message },
            }));
          }
          return;
        }
        setFormError(tErrors(apiErrorKey(error)));
      }
    },
  });

  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-md sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
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
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("nameLabel")}</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  // Suggest an address from the name until it's edited.
                  if (!slugEdited) {
                    form.setFieldValue("slug", slugify(event.target.value));
                  }
                }}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("slugLabel")}</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  setSlugEdited(true);
                  field.handleChange(event.target.value);
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t("slugHint", {
                  url: `${window.location.host}/${field.state.value || "…"}`,
                })}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="defaultLocale">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("localeLabel")}</Label>
              <select
                id={field.name}
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
              <p className="text-muted-foreground text-xs">{t("localeHint")}</p>
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
            <Button type="submit" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </main>
  );
}
