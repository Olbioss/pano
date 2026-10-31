-- One workspace per account counts the workspaces an account owns, so
-- joining another team never stops anyone from making their own (#8). This
-- index makes the rule hold for two creates at the same moment too (#7).
-- It's hand-written because Better Auth generates the member table's schema
-- (worker/db/schema/auth.ts), which would drop an index added there.
CREATE UNIQUE INDEX "member_one_owned_workspace_idx" ON "member" ("user_id") WHERE "role" = 'owner';
