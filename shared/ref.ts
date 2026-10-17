import { slugify } from "./slug";

/** A post's address segment: its id, then its title as a slug. */
export function postRef(id: number, title: string): string {
  const slug = slugify(title);
  return slug ? `${id}-${slug}` : String(id);
}

/** The post id at the start of a ref, or null when there isn't a valid one. */
export function parseRef(ref: string): number | null {
  const match = /^(\d{1,15})(?:-|$)/.exec(ref);
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
}
