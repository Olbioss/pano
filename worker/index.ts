import app from "./app";
import type { Bindings } from "./env";

// The app types its bindings structurally (see env.ts), so tests can build
// them by hand. This line ties them back to what wrangler.jsonc and .dev.vars
// actually provide: rename or drop a binding there and the typecheck fails,
// instead of every test passing and production answering 500.
type Assert<T extends true> = T;
export type BindingsMatchWrangler = Assert<Env extends Bindings ? true : false>;

// The Workers entry point. Cron triggers and link-preview rewriting join this
// file in later phases; the API itself lives in app.ts.
export default app;
