CREATE TYPE "public"."hardware_kind" AS ENUM('gpu', 'chip');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
CREATE TABLE "benchmark_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"hardware_id" text NOT NULL,
	"hardware_kind" "hardware_kind" NOT NULL,
	"vram_gb" real,
	"ram_gb" real,
	"model_id" text NOT NULL,
	"quant" text NOT NULL,
	"engine" text NOT NULL,
	"engine_version" text,
	"context_depth" integer DEFAULT 0 NOT NULL,
	"tg_tps" real NOT NULL,
	"pp_tps" real,
	"raw_output" text,
	"notes" text,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"hardware_id" text NOT NULL,
	"hardware_kind" "hardware_kind" NOT NULL,
	"model_id" text NOT NULL,
	"quant" text NOT NULL,
	"engine" text NOT NULL,
	"engine_version" text,
	"context_depth" integer DEFAULT 0 NOT NULL,
	"tg_tps" real NOT NULL,
	"pp_tps" real,
	"source_url" text NOT NULL,
	"source_label" text NOT NULL,
	"measured_at" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_chips" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"memory_options_gb" real[] NOT NULL,
	"bandwidth_gbs" real NOT NULL,
	"match_keys" text[] NOT NULL,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"speed_factor" real NOT NULL,
	"platforms" text[] NOT NULL,
	"requires_full_gpu" boolean NOT NULL,
	"notes" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpus" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"series" text NOT NULL,
	"name" text NOT NULL,
	"vram_gb" real[] NOT NULL,
	"bandwidth_gbs" real NOT NULL,
	"tdp_w" real,
	"form_factor" text NOT NULL,
	"match_keys" text[] NOT NULL,
	"is_modded" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_quants" (
	"model_id" text NOT NULL,
	"quant_id" text NOT NULL,
	"file_size_gb" real NOT NULL,
	"source_repo" text,
	CONSTRAINT "model_quants_model_id_quant_id_pk" PRIMARY KEY("model_id","quant_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lab" text NOT NULL,
	"family" text NOT NULL,
	"hf_repo" text,
	"total_params_b" real NOT NULL,
	"active_params_b" real NOT NULL,
	"arch" text NOT NULL,
	"layers" integer NOT NULL,
	"attention" jsonb NOT NULL,
	"arch_source" text NOT NULL,
	"context_native" integer,
	"license" text NOT NULL,
	"license_class" text NOT NULL,
	"modalities" text[] NOT NULL,
	"use_cases" text[] NOT NULL,
	"release_date" text,
	"ollama_tag" text,
	"mlx_repo" text,
	"legacy" boolean DEFAULT false NOT NULL,
	"note" text,
	"verified" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quants" (
	"id" text PRIMARY KEY NOT NULL,
	"bits_per_weight" real NOT NULL,
	"label" text NOT NULL,
	"note" text NOT NULL,
	"recommendable" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_submissions" ADD CONSTRAINT "benchmark_submissions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_submissions" ADD CONSTRAINT "benchmark_submissions_quant_quants_id_fk" FOREIGN KEY ("quant") REFERENCES "public"."quants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_submissions" ADD CONSTRAINT "benchmark_submissions_engine_engines_id_fk" FOREIGN KEY ("engine") REFERENCES "public"."engines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_quant_quants_id_fk" FOREIGN KEY ("quant") REFERENCES "public"."quants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_engine_engines_id_fk" FOREIGN KEY ("engine") REFERENCES "public"."engines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_quants" ADD CONSTRAINT "model_quants_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_quants" ADD CONSTRAINT "model_quants_quant_id_quants_id_fk" FOREIGN KEY ("quant_id") REFERENCES "public"."quants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "benchmark_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "benchmarks_lookup_idx" ON "benchmarks" USING btree ("hardware_id","model_id");--> statement-breakpoint
CREATE INDEX "models_status_idx" ON "models" USING btree ("status");