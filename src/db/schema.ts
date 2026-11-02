import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { Attention } from "@/lib/schema";

export const reviewStatus = pgEnum("review_status", ["approved", "pending", "rejected"]);
export const hardwareKind = pgEnum("hardware_kind", ["gpu", "chip"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const models = pgTable(
  "models",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    lab: text("lab").notNull(),
    family: text("family").notNull(),
    hfRepo: text("hf_repo"),
    totalParamsB: real("total_params_b").notNull(),
    activeParamsB: real("active_params_b").notNull(),
    arch: text("arch", { enum: ["dense", "moe"] }).notNull(),
    layers: integer("layers").notNull(),
    attention: jsonb("attention").$type<Attention>().notNull(),
    archSource: text("arch_source", { enum: ["config", "brief", "estimated"] }).notNull(),
    contextNative: integer("context_native"),
    license: text("license").notNull(),
    licenseClass: text("license_class", { enum: ["permissive", "restricted", "unknown"] }).notNull(),
    modalities: text("modalities").array().notNull(),
    useCases: text("use_cases").array().notNull(),
    releaseDate: text("release_date"),
    ollamaTag: text("ollama_tag"),
    mlxRepo: text("mlx_repo"),
    legacy: boolean("legacy").notNull().default(false),
    note: text("note"),
    verified: boolean("verified").notNull().default(false),
    /** Admin review queue: only "approved" models are served to the site. */
    status: reviewStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("models_status_idx").on(t.status)],
);

export const quants = pgTable("quants", {
  id: text("id").primaryKey(),
  bitsPerWeight: real("bits_per_weight").notNull(),
  label: text("label").notNull(),
  note: text("note").notNull(),
  recommendable: boolean("recommendable").notNull(),
});

/** Real per-quant file sizes from GGUF repos; the estimator falls back to params x bpw. */
export const modelQuants = pgTable(
  "model_quants",
  {
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    quantId: text("quant_id").notNull().references(() => quants.id),
    fileSizeGb: real("file_size_gb").notNull(),
    sourceRepo: text("source_repo"),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.quantId] })],
);

export const gpus = pgTable("gpus", {
  id: text("id").primaryKey(),
  vendor: text("vendor", { enum: ["nvidia", "amd", "intel"] }).notNull(),
  series: text("series").notNull(),
  name: text("name").notNull(),
  vramGb: real("vram_gb").array().notNull(),
  bandwidthGbs: real("bandwidth_gbs").notNull(),
  tdpW: real("tdp_w"),
  formFactor: text("form_factor", { enum: ["desktop", "laptop", "workstation", "datacenter"] }).notNull(),
  matchKeys: text("match_keys").array().notNull(),
  isModded: boolean("is_modded").notNull().default(false),
  source: text("source", { enum: ["config", "brief", "estimated"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const cpus = pgTable("cpus", {
  id: text("id").primaryKey(),
  vendor: text("vendor", { enum: ["intel", "amd"] }).notNull(),
  series: text("series").notNull(),
  name: text("name").notNull(),
  cores: integer("cores").notNull(),
  threads: integer("threads").notNull(),
  memoryChannels: integer("memory_channels").notNull(),
  ramTypes: text("ram_types").array().notNull(),
  defaultMts: integer("default_mts").notNull(),
  avx512: boolean("avx512").notNull(),
  formFactor: text("form_factor", { enum: ["desktop", "laptop", "workstation", "server"] }).notNull(),
  source: text("source", { enum: ["config", "brief", "estimated"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const chips = pgTable("unified_chips", {
  id: text("id").primaryKey(),
  vendor: text("vendor", { enum: ["apple", "amd", "nvidia"] }).notNull(),
  family: text("family").notNull(),
  name: text("name").notNull(),
  memoryOptionsGb: real("memory_options_gb").array().notNull(),
  bandwidthGbs: real("bandwidth_gbs").notNull(),
  matchKeys: text("match_keys").array().notNull(),
  source: text("source", { enum: ["config", "brief", "estimated"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const engines = pgTable("engines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  speedFactor: real("speed_factor").notNull(),
  platforms: text("platforms").array().notNull(),
  requiresFullGpu: boolean("requires_full_gpu").notNull(),
  notes: text("notes").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const benchmarks = pgTable(
  "benchmarks",
  {
    id: serial("id").primaryKey(),
    hardwareId: text("hardware_id").notNull(),
    hardwareKind: hardwareKind("hardware_kind").notNull(),
    modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    quant: text("quant").notNull().references(() => quants.id),
    engine: text("engine").notNull().references(() => engines.id),
    engineVersion: text("engine_version"),
    contextDepth: integer("context_depth").notNull().default(0),
    tgTps: real("tg_tps").notNull(),
    ppTps: real("pp_tps"),
    sourceUrl: text("source_url").notNull(),
    sourceLabel: text("source_label").notNull(),
    measuredAt: text("measured_at"),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("benchmarks_lookup_idx").on(t.hardwareId, t.modelId)],
);

/**
 * Self-reported runs (users paste llama-bench JSON / Ollama --verbose output).
 * They land as "pending" and are promoted into `benchmarks` after moderation.
 */
export const benchmarkSubmissions = pgTable(
  "benchmark_submissions",
  {
    id: serial("id").primaryKey(),
    hardwareId: text("hardware_id").notNull(),
    hardwareKind: hardwareKind("hardware_kind").notNull(),
    vramGb: real("vram_gb"),
    ramGb: real("ram_gb"),
    modelId: text("model_id").notNull().references(() => models.id),
    quant: text("quant").notNull().references(() => quants.id),
    engine: text("engine").notNull().references(() => engines.id),
    engineVersion: text("engine_version"),
    contextDepth: integer("context_depth").notNull().default(0),
    tgTps: real("tg_tps").notNull(),
    ppTps: real("pp_tps"),
    rawOutput: text("raw_output"),
    notes: text("notes"),
    /** Automatic checks (physics ceiling, etc.) recorded at submit time. */
    flags: text("flags").array().notNull().default([]),
    status: reviewStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submissions_status_idx").on(t.status)],
);
