CREATE TABLE "auth"."login_throttle" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"window_seconds" integer NOT NULL,
	CONSTRAINT "login_throttle_key" CHECK ("auth"."login_throttle"."bucket_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "login_throttle_limit" CHECK ("auth"."login_throttle"."max_attempts" between 1 and 100),
	CONSTRAINT "login_throttle_window" CHECK ("auth"."login_throttle"."window_seconds" between 60 and 86400),
	CONSTRAINT "login_throttle_attempts" CHECK ("auth"."login_throttle"."attempts" between 0 and "auth"."login_throttle"."max_attempts")
);
