ALTER TABLE "posts" DROP CONSTRAINT "posts_merged_into_id_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_merged_into_id_posts_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;