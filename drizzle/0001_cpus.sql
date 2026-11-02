CREATE TABLE "cpus" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"series" text NOT NULL,
	"name" text NOT NULL,
	"cores" integer NOT NULL,
	"threads" integer NOT NULL,
	"memory_channels" integer NOT NULL,
	"ram_types" text[] NOT NULL,
	"default_mts" integer NOT NULL,
	"avx512" boolean NOT NULL,
	"form_factor" text NOT NULL,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
