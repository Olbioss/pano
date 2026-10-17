import { excerpt } from "@/shared/excerpt";
import { parseRef, postRef } from "@/shared/ref";
import { createDb } from "./db/client";
import { findPostMeta } from "./services/posts";

export type PostMeta = {
  title: string;
  description: string;
  canonicalPath: string;
};

/** What a link preview shows for a post. */
export function postMeta(post: {
  id: number;
  title: string;
  body: string;
  workspaceName: string;
}): PostMeta {
  return {
    title: `${post.title} · ${post.workspaceName}`,
    description:
      excerpt(post.body, 200) || `A request on ${post.workspaceName}'s board`,
    canonicalPath: `/p/${postRef(post.id, post.title)}`,
  };
}

/** For attribute values in the HTML this file writes itself. */
export function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const withStatus = (res: Response, status: number) =>
  new Response(res.body, { status, headers: res.headers });

/**
 * /p/:ref reaches the Worker before the assets layer. It answers with the
 * SPA shell, with the post's title and excerpt in the meta tags, so shared
 * links unfurl. A stale slug redirects to the current one. An unknown post
 * keeps the shell, where the SPA shows "not found", with a 404 for crawlers.
 */
export async function renderPostPage(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const shell = await env.ASSETS.fetch(new Request(new URL("/", url)));
  const id = parseRef(url.pathname.slice("/p/".length));
  if (id === null) return withStatus(shell, 404);
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const post = await findPostMeta(db, id);
    if (!post) return withStatus(shell, 404);
    const meta = postMeta(post);
    if (url.pathname !== meta.canonicalPath) {
      const current = new URL(`${meta.canonicalPath}${url.search}`, url);
      // A 301 without caching rules is kept forever. Once the title changed
      // back, a remembered old→new hop and the new→old one would loop.
      return new Response(null, {
        status: 301,
        headers: { location: current.toString(), "cache-control": "no-store" },
      });
    }
    const canonical = escapeAttribute(
      new URL(meta.canonicalPath, url).toString()
    );
    return new HTMLRewriter()
      .on("title", {
        element: (el) => {
          el.setInnerContent(meta.title);
        },
      })
      .on('meta[name="description"], meta[property="og:description"]', {
        element: (el) => {
          el.setAttribute("content", meta.description);
        },
      })
      .on('meta[property="og:title"]', {
        element: (el) => {
          el.setAttribute("content", meta.title);
        },
      })
      .on("head", {
        element: (el) => {
          el.append(
            `<meta property="og:url" content="${canonical}"><link rel="canonical" href="${canonical}">`,
            { html: true }
          );
        },
      })
      .transform(shell);
  } finally {
    ctx.waitUntil(close());
  }
}
