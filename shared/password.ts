import { z } from "zod";

/** A password's length, the same on the client and the server. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
