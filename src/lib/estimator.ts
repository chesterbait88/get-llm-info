/**
 * Fit + speed estimator. Pure functions, no I/O: runs in the browser and in tests.
 *
 * Output speed is bound by memory bandwidth: every generated token reads all the
 * model's *active* weights (plus the KV cache) once, so
 *
 *   seconds/token ≈ B_gpu / (η_gpu·BW_gpu) + B_cpu / (η_cpu·BW_ram) + overhead
 *
 * where `overhead` is a small fixed per-layer cost (kernel launches, routing). It
 * is negligible for dense models but dominates small-active MoE models on fast
 * GPUs, which is why a 30B-A3B on an RTX 3090 measures ~115 tok/s rather than
 * its ~260 tok/s bandwidth ceiling.
 */
import type { Attention, Benchmark, Engine, Model, Quant, QuantId } from "./schema";

// ---------------------------------------------------------------------------
// Tunables (calibrate from measured data; see the accuracy table on the site)
// ---------------------------------------------------------------------------

/** Runtime overhead (CUDA/Metal context, compute buffers), GB. */
export const RUNTIME_OVERHEAD_GB = 1.0;
/** Fixed per-layer, per-token cost in milliseconds. */
export const LAYER_OVERHEAD_MS = { dense: 0.01, moe: 0.12 } as const;
/** System-RAM side efficiency (CPU decode reaches ~60% of theoretical bandwidth). */
export const CPU_EFFICIENCY = 0.6;
/** Clamp for per-device calibration ratios learned from measured runs. */
const CALIBRATION_CLAMP: [number, number] = [0.5, 1.5];

export type Platform = "nvidia" | "amd" | "intel" | "apple" | "unified-x86" | "unified-arm" | "cpu";

/** CPU facts that matter for the system-RAM side of decoding. */
export interface CpuInfo {
  cores: number;
  avx512: boolean;
}

export type Hardware =
  | {
      kind: "discrete";
      id: string;
      name: string;
      vendor: "nvidia" | "amd" | "intel";
      vramGb: number;
      bandwidthGbs: number;
      ramGb: number;
      ramBandwidthGbs: number;
      cpu?: CpuInfo;
    }
  | {
      kind: "unified";
      id: string;
      name: string;
      vendor: "apple" | "amd" | "nvidia";
      memoryGb: number;
      bandwidthGbs: number;
    }
  | {
      kind: "cpu";
      id: "cpu";
      name: string;
      ramGb: number;
      ramBandwidthGbs: number;
      cpu?: CpuInfo;
    };

export type Preference = "balanced" | "quality" | "speed";

export interface Settings {
  /** Context window the user wants to allocate (fit). */
  contextTokens: number;
  /** Conversation depth at which the headline speed is quoted. */
  depthTokens: number;
  /** Bytes per KV value: 2 (F16), 1.0625 (q8_0), 0.5625 (q4_0). */
  kvCacheBytes: number;
  engine: Engine;
  preference: Preference;
  /** GB of VRAM kept free for the desktop/driver. */
  vramReserveGb: number;
  /** GB of system RAM kept for the OS; null = automatic. */
  ramReserveGb: number | null;
  /** Unified memory kept for the OS; null = automatic. */
  osReserveGb: number | null;
}

export const DEFAULT_SETTINGS: Omit<Settings, "engine"> = {
  contextTokens: 8192,
  depthTokens: 1024,
  kvCacheBytes: 2,
  preference: "balanced",
  vramReserveGb: 0.8,
  ramReserveGb: null,
  osReserveGb: null,
};

export type Tier = "full-gpu" | "unified" | "partial" | "cpu" | "wont-fit";
export type Verdict = "instant" | "comfortable" | "usable" | "slow";
export type SpeedKind = "measured" | "derived" | "estimated";

export interface QuantEstimate {
  quant: QuantId;
  bitsPerWeight: number;
  weightsGb: number;
  kvGb: number;
  totalGb: number;
  tier: Tier;
  /** Share of weights held in VRAM (partial offload only). */
  gpuFraction: number;
  /** Bytes read per generated token, GB. */
  bytesPerTokenGb: number;
  tps: number | null;
  tpsLow: number | null;
  tpsHigh: number | null;
  speedKind: SpeedKind;
  verdict: Verdict | null;
  benchmark?: Benchmark;
  /** Memory still missing to fit at all (wont-fit) or to go fully on-GPU (partial). */
  shortfallGb: number;
  reason?: string;
  /** Context actually allocated (capped at the model's native context). */
  contextTokens: number;
}

export interface ModelResult {
  model: Model;
  pick: QuantEstimate;
  all: QuantEstimate[];
  effectiveSizeB: number;
}

// ---------------------------------------------------------------------------
// Basic quantities
// ---------------------------------------------------------------------------

/** System RAM bandwidth in GB/s = channels × MT/s × 8 bytes. */
export function ramBandwidthGbs(mts: number, channels: number): number {
  return (channels * mts * 8) / 1000;
}

export function weightsGb(totalParamsB: number, bitsPerWeight: number): number {
  return (totalParamsB * bitsPerWeight) / 8;
}

/** KV-cache size in GB for `tokens` of context. */
export function kvCacheGb(att: Attention, tokens: number, bytesPerValue: number): number {
  if (tokens <= 0) return 0;
  let elements: number;
  if (att.mlaDim) {
    elements = att.fullLayers * att.mlaDim * tokens;
  } else {
    const perLayerPerToken = 2 * att.kvHeads * att.headDim;
    const slidingTokens = att.window ? Math.min(tokens, att.window) : tokens;
    elements = perLayerPerToken * (att.fullLayers * tokens + att.slidingLayers * slidingTokens);
  }
  return (elements * bytesPerValue) / 1e9;
}

/** Capability proxy for ranking: MoE models count as √(total × active). */
export function effectiveSizeB(m: Model): number {
  return m.arch === "moe" ? Math.sqrt(m.totalParamsB * m.activeParamsB) : m.totalParamsB;
}

export function platformOf(hw: Hardware): Platform {
  if (hw.kind === "cpu") return "cpu";
  if (hw.kind === "discrete") return hw.vendor;
  if (hw.vendor === "apple") return "apple";
  return hw.vendor === "amd" ? "unified-x86" : "unified-arm";
}

export function engineSupported(engine: Engine, hw: Hardware): boolean {
  return engine.platforms.includes(platformOf(hw));
}

/** Accelerator-side efficiency η (fraction of spec bandwidth achieved in decode). */
export function acceleratorEfficiency(hw: Hardware): number {
  if (hw.kind === "cpu") return CPU_EFFICIENCY;
  if (hw.kind === "unified") {
    if (hw.vendor !== "apple") return 0.6;
    const n = hw.name.toLowerCase();
    if (n.includes("ultra")) return 0.47; // dual-die chips under-deliver
    if (n.includes("max")) return 0.65;
    return 0.75;
  }
  return { nvidia: 0.65, amd: 0.55, intel: 0.45 }[hw.vendor];
}

/**
 * System-RAM side efficiency. Decode on the CPU is bandwidth-bound once there are
 * enough cores to keep the memory bus busy (~8); fewer cores become compute-bound.
 * AVX-512 (Zen 4/5, Xeon) gives llama.cpp's CPU kernels a small edge.
 */
export function cpuEfficiency(hw: Hardware): number {
  if (hw.kind === "unified" || !hw.cpu) return CPU_EFFICIENCY;
  const coreScale = Math.min(1, hw.cpu.cores / 8);
  return CPU_EFFICIENCY * coreScale * (hw.cpu.avx512 ? 1.05 : 1);
}

export function verdictFor(tps: number): Verdict {
  if (tps > 30) return "instant";
  if (tps >= 10) return "comfortable";
  if (tps >= 5) return "usable";
  return "slow";
}

const VERDICT_RANK: Record<Verdict, number> = { instant: 0, comfortable: 1, usable: 2, slow: 3 };
const TIER_RANK: Record<Tier, number> = { "full-gpu": 0, unified: 0, partial: 1, cpu: 2, "wont-fit": 3 };

export function autoRamReserveGb(ramGb: number): number {
  return Math.min(8, Math.max(3, ramGb * 0.2));
}

export function autoOsReserveGb(memoryGb: number): number {
  return Math.min(16, Math.max(4, memoryGb * 0.25));
}

/** Memory pools available to the model. */
export function memoryBudget(hw: Hardware, s: Settings) {
  if (hw.kind === "unified") {
    const reserve = s.osReserveGb ?? autoOsReserveGb(hw.memoryGb);
    return { vram: 0, ram: 0, unified: Math.max(0, hw.memoryGb - reserve) };
  }
  const ramReserve = s.ramReserveGb ?? autoRamReserveGb(hw.ramGb);
  const ram = Math.max(0, hw.ramGb - ramReserve);
  if (hw.kind === "cpu") return { vram: 0, ram, unified: 0 };
  return { vram: Math.max(0, hw.vramGb - s.vramReserveGb), ram, unified: 0 };
}

// ---------------------------------------------------------------------------
// Core estimate for one model × quant on one machine
// ---------------------------------------------------------------------------

export function estimate(model: Model, quant: Quant, hw: Hardware, s: Settings): QuantEstimate {
  const ctx = Math.min(s.contextTokens, model.contextNative ?? s.contextTokens);
  const depth = Math.min(s.depthTokens, ctx);
  const wGb = weightsGb(model.totalParamsB, quant.bitsPerWeight);
  const kvGb = kvCacheGb(model.attention, ctx, s.kvCacheBytes);
  const totalGb = wGb + kvGb + RUNTIME_OVERHEAD_GB;
  const activeWeightsGb = weightsGb(model.activeParamsB, quant.bitsPerWeight);
  const bytesPerTokenGb = activeWeightsGb + kvCacheGb(model.attention, depth, s.kvCacheBytes);

  const base = {
    quant: quant.id,
    bitsPerWeight: quant.bitsPerWeight,
    weightsGb: wGb,
    kvGb,
    totalGb,
    bytesPerTokenGb,
    contextTokens: ctx,
    speedKind: "estimated" as SpeedKind,
  };
  const noFit = (shortfallGb: number, reason: string): QuantEstimate => ({
    ...base,
    tier: "wont-fit",
    gpuFraction: 0,
    tps: null,
    tpsLow: null,
    tpsHigh: null,
    verdict: null,
    shortfallGb,
    reason,
  });

  if (!engineSupported(s.engine, hw)) return noFit(0, `${s.engine.name} does not run on this hardware`);

  const budget = memoryBudget(hw, s);
  const overheadSec = (model.layers * LAYER_OVERHEAD_MS[model.arch]) / 1000;
  const etaAcc = acceleratorEfficiency(hw);
  let tier: Tier;
  let gpuFraction = 0;
  let seconds: number;
  let shortfallGb = 0;

  if (hw.kind === "unified") {
    if (totalGb > budget.unified) return noFit(totalGb - budget.unified, "Needs more unified memory");
    tier = "unified";
    seconds = bytesPerTokenGb / (etaAcc * hw.bandwidthGbs);
  } else if (hw.kind === "cpu") {
    if (totalGb > budget.ram) return noFit(totalGb - budget.ram, "Needs more system RAM");
    tier = "cpu";
    seconds = bytesPerTokenGb / (cpuEfficiency(hw) * hw.ramBandwidthGbs);
  } else if (totalGb <= budget.vram) {
    tier = "full-gpu";
    seconds = bytesPerTokenGb / (etaAcc * hw.bandwidthGbs);
  } else {
    if (s.engine.requiresFullGpu) {
      return noFit(totalGb - budget.vram, `${s.engine.name} needs the whole model in VRAM`);
    }
    if (totalGb > budget.vram + budget.ram) {
      return noFit(totalGb - budget.vram - budget.ram, "Needs more VRAM + RAM");
    }
    // Runtime buffers live on the GPU; layers (weights + their KV) split by capacity.
    const gpuRoom = Math.max(0, budget.vram - RUNTIME_OVERHEAD_GB);
    gpuFraction = Math.min(1, gpuRoom / (wGb + kvGb));
    tier = gpuFraction < 0.05 ? "cpu" : "partial";
    shortfallGb = totalGb - budget.vram;
    seconds =
      (gpuFraction * bytesPerTokenGb) / (etaAcc * hw.bandwidthGbs) +
      ((1 - gpuFraction) * bytesPerTokenGb) / (cpuEfficiency(hw) * hw.ramBandwidthGbs);
  }

  const tps = s.engine.speedFactor / (seconds + overheadSec);
  const spread = tier === "partial" || tier === "cpu" ? 0.35 : model.arch === "moe" ? 0.3 : 0.2;
  return {
    ...base,
    tier,
    gpuFraction,
    tps,
    tpsLow: tps * (1 - spread),
    tpsHigh: tps * (1 + spread),
    verdict: verdictFor(tps),
    shortfallGb,
  };
}

// ---------------------------------------------------------------------------
// Calibration + measured overrides
// ---------------------------------------------------------------------------

export interface CatalogRefs {
  models: Model[];
  quants: Quant[];
  benchmarks: Benchmark[];
}

/**
 * Ratio measured/estimated for this exact device (llama.cpp runs only), median
 * over all its benchmarks. 1 when the device has no measurements.
 */
export function calibrationFor(hw: Hardware, s: Settings, refs: CatalogRefs, llamaCpp: Engine) {
  const ratios: number[] = [];
  for (const b of refs.benchmarks) {
    if (b.hardwareId !== hw.id || b.engine !== "llamacpp") continue;
    const model = refs.models.find((m) => m.id === b.modelId);
    const quant = refs.quants.find((q) => q.id === b.quant);
    if (!model || !quant) continue;
    const est = estimate(model, quant, hw, {
      ...s,
      engine: llamaCpp,
      depthTokens: b.contextDepth,
      contextTokens: Math.max(b.contextDepth, 512),
    });
    if (est.tps && est.tier !== "partial" && est.tier !== "cpu") ratios.push(b.tgTps / est.tps);
  }
  if (!ratios.length) return { factor: 1, samples: 0 };
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  const factor = Math.min(CALIBRATION_CLAMP[1], Math.max(CALIBRATION_CLAMP[0], median));
  return { factor, samples: ratios.length };
}

function applyCalibration(e: QuantEstimate, factor: number): QuantEstimate {
  if (e.tps == null || factor === 1) return e;
  const tps = e.tps * factor;
  const half = (e.tpsHigh! - e.tps) / e.tps / 2; // calibrated => tighter range
  const spread = Math.max(0.1, half);
  return { ...e, tps, tpsLow: tps * (1 - spread), tpsHigh: tps * (1 + spread), verdict: verdictFor(tps) };
}

function applyMeasured(e: QuantEstimate, model: Model, hw: Hardware, s: Settings, benches: Benchmark[]): QuantEstimate {
  if (e.tps == null) return e;
  const matches = benches.filter(
    (b) => b.hardwareId === hw.id && b.modelId === model.id && b.quant === e.quant && b.contextDepth <= 2048,
  );
  const exact = matches.find((b) => b.engine === s.engine.id);
  if (exact) return { ...e, tps: exact.tgTps, tpsLow: null, tpsHigh: null, speedKind: "measured", verdict: verdictFor(exact.tgTps), benchmark: exact };
  const llama = matches.find((b) => b.engine === "llamacpp");
  if (llama) {
    const tps = llama.tgTps * s.engine.speedFactor;
    return { ...e, tps, tpsLow: tps * 0.9, tpsHigh: tps * 1.1, speedKind: "derived", verdict: verdictFor(tps), benchmark: llama };
  }
  return e;
}

// ---------------------------------------------------------------------------
// Pick the best quant for a model and rank models
// ---------------------------------------------------------------------------

export function pickQuant(all: QuantEstimate[], pref: Preference): QuantEstimate {
  const fitting = all.filter((e) => e.tier !== "wont-fit");
  if (!fitting.length) {
    // Report the smallest recommendable quant so the shortfall is the minimum needed.
    return [...all].sort((a, b) => a.bitsPerWeight - b.bitsPerWeight)[0];
  }
  const bestOf = (list: QuantEstimate[]) => {
    const rank = Math.min(...list.map((e) => TIER_RANK[e.tier]));
    const inTier = list.filter((e) => TIER_RANK[e.tier] === rank).sort((a, b) => a.bitsPerWeight - b.bitsPerWeight);
    return { inTier, first: inTier.find((e) => e.quant === "Q4_K_M") ?? inTier[0] };
  };
  // Sub-4-bit quants are a squeeze option: use them only when nothing at Q4+ fits,
  // or when dropping quality buys a better speed verdict (e.g. fully on-GPU vs. offloaded).
  const standard = fitting.filter((e) => e.bitsPerWeight >= 4.9);
  const squeeze = fitting.filter((e) => e.bitsPerWeight < 4.9);
  let { inTier, first: speedPick } = bestOf(standard.length ? standard : fitting);
  if (standard.length && squeeze.length) {
    const sq = bestOf(squeeze).first;
    if (VERDICT_RANK[sq.verdict ?? "slow"] < VERDICT_RANK[speedPick.verdict ?? "slow"]) ({ inTier, first: speedPick } = bestOf(fitting));
  }
  if (pref === "speed") return speedPick;
  if (pref === "quality") return inTier[inTier.length - 1];
  // Balanced: when the model sits fully in fast memory, step up in quality while
  // staying in the same speed verdict (capped at Q6_K). When it spills to system
  // RAM every extra bit costs speed directly, so stay on the default.
  if (speedPick.tier === "partial" || speedPick.tier === "cpu") return speedPick;
  const baseVerdict = VERDICT_RANK[speedPick.verdict ?? "slow"];
  const upgrades = inTier.filter(
    (e) => e.bitsPerWeight >= speedPick.bitsPerWeight && e.bitsPerWeight <= 6.6 && VERDICT_RANK[e.verdict ?? "slow"] <= baseVerdict,
  );
  return upgrades[upgrades.length - 1] ?? speedPick;
}

export function evaluateModel(model: Model, hw: Hardware, s: Settings, refs: CatalogRefs, calibration = 1): ModelResult {
  const run = (q: Quant) => applyMeasured(applyCalibration(estimate(model, q, hw, s), calibration), model, hw, s, refs.benchmarks);
  const recommendable = refs.quants.filter((q) => q.recommendable).map(run);
  const pick = pickQuant(recommendable, s.preference);
  // Non-recommendable quants (Q4_0, F16) are listed only when we hold a measurement for them.
  const measuredExtras = refs.quants
    .filter((q) => !q.recommendable)
    .map(run)
    .filter((e) => e.speedKind !== "estimated");
  const all = [...recommendable, ...measuredExtras].sort((a, b) => a.bitsPerWeight - b.bitsPerWeight);
  return { model, pick, all, effectiveSizeB: effectiveSizeB(model) };
}

/**
 * Default ranking ("best match"): models that write at 10+ tok/s first (largest
 * first), then merely usable ones, then slow ones, then models that won't fit
 * (closest to fitting first).
 */
export function rankResults(results: ModelResult[]): ModelResult[] {
  const group = (r: ModelResult) => {
    if (r.pick.tier === "wont-fit") return 3;
    if (r.pick.verdict === "slow") return 2;
    return r.pick.verdict === "usable" ? 1 : 0;
  };
  return [...results].sort((a, b) => {
    const g = group(a) - group(b);
    if (g) return g;
    if (group(a) === 3) return a.pick.shortfallGb - b.pick.shortfallGb;
    return b.effectiveSizeB - a.effectiveSizeB;
  });
}
