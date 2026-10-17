import { z } from "zod";
import {
  displayNameSchema,
  postBodySchema,
  postTitleSchema,
} from "@/shared/schemas";

/** The new-request form. The name is required only while the person has none. */
export function submitFormSchema(needsName: boolean) {
  return z.object({
    name: needsName ? displayNameSchema : z.string(),
    boardId: z.uuid(),
    title: postTitleSchema,
    body: postBodySchema,
  });
}
