CREATE TABLE "posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"board_id" uuid NOT NULL,
	"author_id" text,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"merged_into_id" bigint,
	"search_config" "regconfig" NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector(search_config, pano_fold(title)), 'A') || setweight(to_tsvector(search_config, pano_fold(body)), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_vote_count_check" CHECK ("posts"."vote_count" >= 0),
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"post_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_merged_into_id_posts_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_board_created_idx" ON "posts" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_organization_created_idx" ON "posts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_organization_votes_idx" ON "posts" USING btree ("organization_id","vote_count");--> statement-breakpoint
CREATE INDEX "posts_search_idx" ON "posts" USING gin ("search");--> statement-breakpoint
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING gin (pano_fold("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "votes_created_idx" ON "votes" USING btree ("created_at");