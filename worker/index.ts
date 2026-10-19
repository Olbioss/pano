import app from "./app";
import { runScheduled } from "./cron";
import type { Bindings } from "./env";
import { renderPostPage } from "./og";

// The app types its bindings structurally (see env.ts), so tests can build
// them by hand. This line ties them back to what wrangler.jsonc and .dev.vars
// actually provide: rename or drop a binding there and the typecheck fails,
// instead of every test passing and production answering 500.
type Assert<T extends true> = T;
export type BindingsMatchWrangler = Assert<Env extends Bindings ? true : false>;

// The Workers entry point. /p/* gets the app shell with the post's link
// preview; every other path run_worker_first sends here is the API. Cron
// triggers run in the background after the trigger is acknowledged.
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/p/")) {
      return renderPostPage(request, env, ctx);
    }
    return app.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller.cron, env));
  },
} satisfies ExportedHandler<Env>;
