ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "posts_pinned_comment_idx" ON "posts" USING btree ("pinned_comment_id") WHERE "posts"."pinned_comment_id" is not null;