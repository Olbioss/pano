import { z } from "zod";
import type { FieldErrorKey } from "./field-errors";
import { LOCALES } from "./locale";
import { isReservedSlug, slugify } from "./slug";

/** A field-error key as a zod issue message, checked at compile time. */
const key = (error: FieldErrorKey) => ({ error });

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(SLUG_PATTERN, key("SLUG_FORMAT"))
  .refine((slug) => !isReservedSlug(slug), key("SLUG_RESERVED"));

export const workspaceNameSchema = z.string().trim().min(2).max(60);
export const localeSchema = z.enum(LOCALES);

export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema,
  defaultLocale: localeSchema,
});

export const updateWorkspaceSchema = z
  .object({
    name: workspaceNameSchema.optional(),
    defaultLocale: localeSchema.optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.defaultLocale !== undefined,
    key("NOTHING_TO_UPDATE")
  );

export const boardNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .refine((name) => slugify(name).length >= 2, key("NAME_NEEDS_LETTERS"));

export const createBoardSchema = z.object({ name: boardNameSchema });
export const renameBoardSchema = z.object({ name: boardNameSchema });
export const reorderBoardsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});

export const emailFormSchema = z.object({ email: z.email() });
export const codeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, key("CODE_FORMAT")),
});
