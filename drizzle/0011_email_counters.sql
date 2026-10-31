CREATE TABLE "email_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
