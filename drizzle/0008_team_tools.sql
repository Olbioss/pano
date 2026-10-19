CREATE TABLE "email_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"post_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "email_outbox_kind_check" CHECK ("email_outbox"."kind" in ('shipped'))
);
--> statement-breakpoint
CREATE TABLE "status_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"post_id" bigint NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"note" text,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_changes_from_check" CHECK ("status_changes"."from_status" in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')),
	CONSTRAINT "status_changes_to_check" CHECK ("status_changes"."to_status" in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"post_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_once_idx" ON "email_outbox" USING btree ("post_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "email_outbox_unsent_idx" ON "email_outbox" USING btree ("id") WHERE "email_outbox"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "status_changes_post_idx" ON "status_changes" USING btree ("post_id","id");