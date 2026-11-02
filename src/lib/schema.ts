import { z } from "zod";

/** Where a fact came from. "estimated" rows must be re-verified (see scripts/sync-hf.ts). */
export const SourceKind = z.enum(["config", "brief", "estimated"]);

export const UseCase = z.enum([
  "chat",
  "coding",
  "reasoning",
  "vision",
  "long-context",
  "agents",
  "edge",
  "writing",
]);
export type UseCase = z.infer<typeof UseCase>;

export const QuantId = z.enum(["Q3_K_M", "Q4_0", "Q4_K_M", "Q5_K_M", "Q6_K", "Q8_0", "F16"]);
export type QuantId = z.infer<typeof QuantId>;

export const QuantSchema = z.object({
  id: QuantId,
  bitsPerWeight: z.number().positive(),
  label: z.string(),
  note: z.string(),
  /** Never auto-recommended (e.g. F16 is reference only, Q4_0 is legacy). */
  recommendable: z.boolean(),
});
export type Quant = z.infer<typeof QuantSchema>;

/**
 * Attention layout, used for KV-cache size. Modern models mix several kinds of
 * layers, so each kind is counted separately:
 *  - full:    standard (GQA) attention, KV grows with the whole context
 *  - sliding: windowed/chunked attention, KV capped at `window` tokens
 *  - mla:     DeepSeek-style latent attention, one compressed vector per layer
 *  - linear-attention / Mamba layers keep a small fixed state and are ignored
 */
export const AttentionSchema = z.object({
  fullLayers: z.number().int().nonnegative(),
  slidingLayers: z.number().int().nonnegative().default(0),
  window: z.number().int().positive().optional(),
  kvHeads: z.number().int().positive(),
  headDim: z.number().int().positive(),
  /** MLA latent width per token per layer (e.g. 576 for DeepSeek V3). */
  mlaDim: z.number().int().positive().optional(),
});
export type Attention = z.infer<typeof AttentionSchema>;

export const ModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-.]+$/),
  name: z.string(),
  lab: z.string(),
  family: z.string(),
  hfRepo: z.string().nullable(),
  totalParamsB: z.number().positive(),
  /** Active params per token; equals total for dense models. */
  activeParamsB: z.number().positive(),
  arch: z.enum(["dense", "moe"]),
  layers: z.number().int().positive(),
  attention: AttentionSchema,
  archSource: SourceKind,
  contextNative: z.number().int().positive().nullable(),
  license: z.string(),
  licenseClass: z.enum(["permissive", "restricted", "unknown"]),
  modalities: z.array(z.enum(["text", "vision", "audio"])),
  useCases: z.array(UseCase).min(1),
  releaseDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable(),
  ollamaTag: z.string().nullable(),
  mlxRepo: z.string().nullable(),
  /** Hidden unless the user opts into older / reference models. */
  legacy: z.boolean().default(false),
  /** Free-form caveat shown in the row (e.g. Strata-only, short context). */
  note: z.string().optional(),
  verified: z.boolean(),
});
export type Model = z.infer<typeof ModelSchema>;

export const GpuSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  vendor: z.enum(["nvidia", "amd", "intel"]),
  series: z.string(),
  name: z.string(),
  /** VRAM variants in GB; more than one means a VRAM dropdown is shown. */
  vramGb: z.array(z.number().positive()).min(1),
  bandwidthGbs: z.number().positive(),
  tdpW: z.number().positive().nullable(),
  formFactor: z.enum(["desktop", "laptop", "workstation", "datacenter"]),
  /** Normalised keys produced by `extractGpuKey` from a WebGL renderer string. */
  matchKeys: z.array(z.string()),
  isModded: z.boolean().default(false),
  source: SourceKind,
});
export type Gpu = z.infer<typeof GpuSchema>;

export const CpuSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  vendor: z.enum(["intel", "amd"]),
  series: z.string(),
  name: z.string(),
  cores: z.number().int().positive(),
  threads: z.number().int().positive(),
  /** 64-bit memory channels the platform supports (2 = dual channel). */
  memoryChannels: z.number().int().positive(),
  /** Supported RAM types, preferred (default) first. */
  ramTypes: z.array(z.enum(["ddr4", "ddr5", "lpddr5x"])).min(1),
  /** Typical RAM speed for the preferred type, MT/s. */
  defaultMts: z.number().int().positive(),
  avx512: z.boolean(),
  formFactor: z.enum(["desktop", "laptop", "workstation", "server"]),
  source: SourceKind,
});
export type Cpu = z.infer<typeof CpuSchema>;

export const ChipSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  vendor: z.enum(["apple", "amd", "nvidia"]),
  family: z.string(),
  name: z.string(),
  memoryOptionsGb: z.array(z.number().positive()).min(1),
  bandwidthGbs: z.number().positive(),
  matchKeys: z.array(z.string()),
  source: SourceKind,
});
export type Chip = z.infer<typeof ChipSchema>;

export const EngineSchema = z.object({
  id: z.enum(["llamacpp", "ollama", "lmstudio", "mlx", "vllm"]),
  name: z.string(),
  /** Multiplier on llama.cpp's speed (1.0 = baseline). */
  speedFactor: z.number().positive(),
  platforms: z.array(z.enum(["nvidia", "amd", "intel", "apple", "unified-x86", "unified-arm", "cpu"])),
  /** Engine cannot spill weights into system RAM (vLLM). */
  requiresFullGpu: z.boolean(),
  notes: z.string(),
});
export type Engine = z.infer<typeof EngineSchema>;

export const BenchmarkSchema = z.object({
  hardwareId: z.string(),
  hardwareKind: z.enum(["gpu", "chip"]),
  modelId: z.string(),
  quant: QuantId,
  engine: EngineSchema.shape.id,
  engineVersion: z.string().nullable(),
  contextDepth: z.number().int().nonnegative(),
  tgTps: z.number().positive(),
  ppTps: z.number().positive().nullable(),
  sourceUrl: z.string().url(),
  sourceLabel: z.string(),
  measuredAt: z.string().nullable(),
  /** True once someone has re-checked the number against the source. */
  verified: z.boolean(),
});
export type Benchmark = z.infer<typeof BenchmarkSchema>;

export const CatalogSchema = z.object({
  models: z.array(ModelSchema),
  quants: z.array(QuantSchema),
  cpus: z.array(CpuSchema),
  gpus: z.array(GpuSchema),
  chips: z.array(ChipSchema),
  engines: z.array(EngineSchema),
  benchmarks: z.array(BenchmarkSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
