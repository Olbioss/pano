// A Markdown link or image (keep its text), or a formatting marker (drop it).
const MARKDOWN = /!?\[([^\]]*)\]\([^)]*\)|[*_`#>~]/g;

/** Plain text for previews: Markdown removed, whitespace collapsed, cut at a word. */
export function excerpt(text: string, max = 160): string {
  const plain = text
    .replace(MARKDOWN, (_match, label?: string) => label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
