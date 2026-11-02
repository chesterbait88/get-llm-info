/** The user's hardware + preferences, and its round-trip to a shareable query string. */
import type { Catalog, Cpu, Engine, UseCase } from "./schema";
import { DEFAULT_SETTINGS, ramBandwidthGbs, type Hardware, type Preference, type Settings } from "./estimator";
import { SORT_KEYS, type SortDir, type SortKey } from "./sort";

export type Mode = "pc" | "unified" | "cpu";
export type RamType = "ddr4" | "ddr5" | "lpddr5x";
export type KvType = "f16" | "q8" | "q4";

/** Pseudo CPU id for "my CPU isn't listed"; cores then come from `cpuCores`. */
export const OTHER_CPU = "other";

export interface Profile {
  mode: Mode;
  cpuId: string;
  /** Physical cores, used when cpuId is OTHER_CPU. */
  cpuCores: number;
  gpuId: string;
  vramGb: number;
  /** User says the card has non-stock VRAM (modded / upgraded). */
  vramCustom: boolean;
  chipId: string;
  memoryGb: number;
  ramGb: number;
  ramType: RamType;
  ramMts: number;
  ramChannels: number;
  ctx: number;
  kv: KvType;
  engine: Engine["id"];
  pref: Preference;
  use: UseCase | "all";
  license: "all" | "permissive";
  legacy: boolean;
  osReserveGb: number | null;
  sort: SortKey;
  dir: SortDir;
  showSlow: boolean;
  showNoFit: boolean;
}

export const RAM_DEFAULT_MTS: Record<RamType, number> = { ddr4: 3200, ddr5: 6000, lpddr5x: 8000 };
export const KV_BYTES: Record<KvType, number> = { f16: 2, q8: 1.0625, q4: 0.5625 };
export const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144];

export const DEFAULT_PROFILE: Profile = {
  mode: "pc",
  cpuId: "amd-ryzen-7-7800x3d",
  cpuCores: 8,
  gpuId: "nvidia-rtx-4070",
  vramGb: 12,
  vramCustom: false,
  chipId: "apple-m4-pro",
  memoryGb: 48,
  ramGb: 32,
  ramType: "ddr5",
  ramMts: 6000,
  ramChannels: 2,
  ctx: 8192,
  kv: "f16",
  engine: "llamacpp",
  pref: "balanced",
  use: "all",
  license: "all",
  legacy: false,
  osReserveGb: null,
  sort: "recommended",
  dir: "desc",
  showSlow: true,
  showNoFit: false,
};

const KEYS: Record<keyof Profile, string> = {
  mode: "mode",
  cpuId: "cpu",
  cpuCores: "cores",
  gpuId: "gpu",
  vramGb: "vram",
  vramCustom: "vo",
  chipId: "chip",
  memoryGb: "mem",
  ramGb: "ram",
  ramType: "ramType",
  ramMts: "mts",
  ramChannels: "ch",
  ctx: "ctx",
  kv: "kv",
  engine: "engine",
  pref: "pref",
  use: "use",
  license: "lic",
  legacy: "legacy",
  osReserveGb: "osr",
  sort: "sort",
  dir: "dir",
  showSlow: "slow",
  showNoFit: "nofit",
};

/** Only the fields relevant to the chosen mode, minus defaults, go into the URL. */
export function toQuery(p: Profile): string {
  const q = new URLSearchParams();
  const skip = new Set<keyof Profile>();
  if (p.mode !== "pc") skip.add("gpuId").add("vramGb").add("vramCustom");
  if (p.mode !== "unified") skip.add("chipId").add("memoryGb").add("osReserveGb");
  if (p.mode === "unified") skip.add("ramGb").add("ramType").add("ramMts").add("ramChannels").add("cpuId").add("cpuCores");
  if (p.cpuId !== OTHER_CPU) skip.add("cpuCores");
  for (const k of Object.keys(KEYS) as (keyof Profile)[]) {
    if (skip.has(k)) continue;
    const v = p[k];
    if (v === null || v === DEFAULT_PROFILE[k]) continue;
    q.set(KEYS[k], typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  // Hardware is always explicit so a shared link never depends on our defaults.
  if (p.mode === "pc") q.set("gpu", p.gpuId), q.set("vram", String(p.vramGb));
  if (p.mode === "unified") q.set("chip", p.chipId), q.set("mem", String(p.memoryGb));
  if (p.mode !== "unified") q.set("cpu", p.cpuId), q.set("ram", String(p.ramGb));
  q.set("mode", p.mode);
  return q.toString();
}

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
function oneOf<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
const bool = (q: URLSearchParams, key: string, fallback: boolean) => (q.has(key) ? q.get(key) === "1" : fallback);

/** Parse a query string onto a base profile; unknown/invalid values are ignored. */
export function fromQuery(search: string, base: Profile = DEFAULT_PROFILE): Profile {
  const q = new URLSearchParams(search);
  const p: Profile = { ...base };
  p.mode = oneOf(q.get("mode"), ["pc", "unified", "cpu"] as const) ?? p.mode;
  p.cpuId = q.get("cpu") ?? p.cpuId;
  p.cpuCores = num(q.get("cores")) ?? p.cpuCores;
  p.gpuId = q.get("gpu") ?? p.gpuId;
  p.vramGb = num(q.get("vram")) ?? p.vramGb;
  p.vramCustom = bool(q, "vo", p.vramCustom);
  p.chipId = q.get("chip") ?? p.chipId;
  p.memoryGb = num(q.get("mem")) ?? p.memoryGb;
  p.ramGb = num(q.get("ram")) ?? p.ramGb;
  p.ramType = oneOf(q.get("ramType"), ["ddr4", "ddr5", "lpddr5x"] as const) ?? p.ramType;
  p.ramMts = num(q.get("mts")) ?? p.ramMts;
  p.ramChannels = num(q.get("ch")) ?? p.ramChannels;
  p.ctx = num(q.get("ctx")) ?? p.ctx;
  p.kv = oneOf(q.get("kv"), ["f16", "q8", "q4"] as const) ?? p.kv;
  p.engine = oneOf(q.get("engine"), ["llamacpp", "ollama", "lmstudio", "mlx", "vllm"] as const) ?? p.engine;
  p.pref = oneOf(q.get("pref"), ["balanced", "quality", "speed"] as const) ?? p.pref;
  p.use =
    oneOf(q.get("use"), ["all", "chat", "coding", "reasoning", "vision", "long-context", "agents", "edge", "writing"] as const) ??
    p.use;
  p.license = oneOf(q.get("lic"), ["all", "permissive"] as const) ?? p.license;
  p.legacy = bool(q, "legacy", p.legacy);
  if (q.has("osr")) p.osReserveGb = num(q.get("osr")) ?? null;
  p.sort = oneOf(q.get("sort"), SORT_KEYS) ?? p.sort;
  p.dir = oneOf(q.get("dir"), ["asc", "desc"] as const) ?? p.dir;
  p.showSlow = bool(q, "slow", p.showSlow);
  p.showNoFit = bool(q, "nofit", p.showNoFit);
  return p;
}

export function findCpu(p: Profile, cat: Pick<Catalog, "cpus">): Cpu | undefined {
  return cat.cpus.find((c) => c.id === p.cpuId);
}

/** Profile patch applied when a CPU is picked: the platform decides the RAM defaults. */
export function cpuDefaults(cpu: Cpu): Partial<Profile> {
  return { cpuId: cpu.id, ramType: cpu.ramTypes[0], ramMts: cpu.defaultMts, ramChannels: cpu.memoryChannels };
}

/** Build the estimator's hardware description from a profile + catalog. */
export function toHardware(p: Profile, cat: Pick<Catalog, "gpus" | "chips" | "cpus">): Hardware | null {
  const ramBw = ramBandwidthGbs(p.ramMts, p.ramChannels);
  const known = findCpu(p, cat);
  const cpu = known ? { cores: known.cores, avx512: known.avx512 } : { cores: p.cpuCores, avx512: false };
  if (p.mode === "pc") {
    const g = cat.gpus.find((x) => x.id === p.gpuId);
    if (!g) return null;
    const vramGb = p.vramCustom ? p.vramGb : g.vramGb.includes(p.vramGb) ? p.vramGb : g.vramGb[0];
    return { kind: "discrete", id: g.id, name: g.name, vendor: g.vendor, vramGb, bandwidthGbs: g.bandwidthGbs, ramGb: p.ramGb, ramBandwidthGbs: ramBw, cpu };
  }
  if (p.mode === "unified") {
    const c = cat.chips.find((x) => x.id === p.chipId);
    if (!c) return null;
    return { kind: "unified", id: c.id, name: c.name, vendor: c.vendor, memoryGb: p.memoryGb, bandwidthGbs: c.bandwidthGbs };
  }
  return { kind: "cpu", id: "cpu", name: known?.name ?? "your CPU", ramGb: p.ramGb, ramBandwidthGbs: ramBw, cpu };
}

export function toSettings(p: Profile, engine: Engine): Settings {
  return {
    ...DEFAULT_SETTINGS,
    contextTokens: p.ctx,
    kvCacheBytes: KV_BYTES[p.kv],
    engine,
    preference: p.pref,
    osReserveGb: p.osReserveGb,
  };
}
