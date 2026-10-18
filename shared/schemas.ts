import { z } from "zod";
import type { FieldErrorKey } from "./field-errors";
import { LOCALES } from "./locale";
import { isReservedSlug, slugify } from "./slug";
import { POST_STATUSES } from "./status";

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

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;

/** How a person appears next to their posts and comments. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .refine(
    (name) => (name.match(LETTER_OR_DIGIT)?.length ?? 0) >= 2,
    key("NAME_NEEDS_LETTERS")
  );

export const updateMeSchema = z.object({ name: displayNameSchema });

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

export const postTitleSchema = z.string().trim().min(3).max(120);
export const postBodySchema = z.string().trim().max(5000);

export const createPostSchema = z.object({
  boardId: z.uuid(),
  title: postTitleSchema,
  body: postBodySchema,
});

/** The edit form always sends both fields; the PATCH route accepts either. */
export const postFormSchema = z.object({
  title: postTitleSchema,
  body: postBodySchema,
});

export const updatePostSchema = z
  .object({
    title: postTitleSchema.optional(),
    body: postBodySchema.optional(),
  })
  .refine(
    (update) => update.title !== undefined || update.body !== undefined,
    key("NOTHING_TO_UPDATE")
  );

export const voteSchema = z.object({ voted: z.boolean() });

export const FEED_SORTS = ["trending", "top", "new"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const feedQuerySchema = z.object({
  board: z.string().max(40).optional(),
  sort: z.enum(FEED_SORTS).default("trending"),
  status: z.enum(POST_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const similarQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  board: z.string().max(40).optional(),
});

export const commentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(3000)
  // Postgres text can't hold NUL; caught here it's a 400, not a 500.
  .refine((body) => !body.includes("\u0000"));

const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createCommentSchema = z.object({
  body: commentBodySchema,
  parentId: idSchema.optional(),
});

/** Keyset paging: the page of comments before the id `before`. */
export const commentPageQuerySchema = z.object({
  before: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const pinSchema = z.object({ commentId: idSchema.nullable() });
