/** The user's hardware + preferences, and its round-trip to a shareable query string. */
import type { Catalog, Engine, UseCase } from "./schema";
import { DEFAULT_SETTINGS, ramBandwidthGbs, type Hardware, type Preference, type Settings } from "./estimator";

export type Mode = "pc" | "unified" | "cpu";
export type RamType = "ddr4" | "ddr5" | "lpddr5x";
export type KvType = "f16" | "q8" | "q4";

export interface Profile {
  mode: Mode;
  gpuId: string;
  vramGb: number;
  chipId: string;
  memoryGb: number;
  ramGb: number;
  ramType: RamType;
  ramMts: number;
  ramChannels: number;
  cpuThreads: number | null;
  ctx: number;
  kv: KvType;
  engine: Engine["id"];
  pref: Preference;
  use: UseCase | "all";
  license: "all" | "permissive";
  legacy: boolean;
  osReserveGb: number | null;
}

export const RAM_DEFAULT_MTS: Record<RamType, number> = { ddr4: 3200, ddr5: 6000, lpddr5x: 8000 };
export const KV_BYTES: Record<KvType, number> = { f16: 2, q8: 1.0625, q4: 0.5625 };
export const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144];

export const DEFAULT_PROFILE: Profile = {
  mode: "pc",
  gpuId: "nvidia-rtx-4070",
  vramGb: 12,
  chipId: "apple-m4-pro",
  memoryGb: 48,
  ramGb: 32,
  ramType: "ddr5",
  ramMts: 6000,
  ramChannels: 2,
  cpuThreads: null,
  ctx: 8192,
  kv: "f16",
  engine: "llamacpp",
  pref: "balanced",
  use: "all",
  license: "all",
  legacy: false,
  osReserveGb: null,
};

const KEYS: Record<keyof Profile, string> = {
  mode: "mode",
  gpuId: "gpu",
  vramGb: "vram",
  chipId: "chip",
  memoryGb: "mem",
  ramGb: "ram",
  ramType: "ramType",
  ramMts: "mts",
  ramChannels: "ch",
  cpuThreads: "threads",
  ctx: "ctx",
  kv: "kv",
  engine: "engine",
  pref: "pref",
  use: "use",
  license: "lic",
  legacy: "legacy",
  osReserveGb: "osr",
};

/** Only the fields relevant to the chosen mode, minus defaults, go into the URL. */
export function toQuery(p: Profile): string {
  const q = new URLSearchParams();
  const skip = new Set<keyof Profile>(["cpuThreads"]);
  if (p.mode !== "pc") skip.add("gpuId").add("vramGb");
  if (p.mode !== "unified") skip.add("chipId").add("memoryGb").add("osReserveGb");
  if (p.mode === "unified") skip.add("ramGb").add("ramType").add("ramMts").add("ramChannels");
  for (const k of Object.keys(KEYS) as (keyof Profile)[]) {
    if (skip.has(k)) continue;
    const v = p[k];
    if (v === null || v === DEFAULT_PROFILE[k]) continue;
    q.set(KEYS[k], typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  if (p.mode === "pc") q.set("gpu", p.gpuId), q.set("vram", String(p.vramGb));
  if (p.mode === "unified") q.set("chip", p.chipId), q.set("mem", String(p.memoryGb));
  if (p.mode !== "unified") q.set("ram", String(p.ramGb));
  q.set("mode", p.mode);
  return q.toString();
}

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
function oneOf<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Parse a query string onto a base profile; unknown/invalid values are ignored. */
export function fromQuery(search: string, base: Profile = DEFAULT_PROFILE): Profile {
  const q = new URLSearchParams(search);
  const p: Profile = { ...base };
  p.mode = oneOf(q.get("mode"), ["pc", "unified", "cpu"] as const) ?? p.mode;
  p.gpuId = q.get("gpu") ?? p.gpuId;
  p.vramGb = num(q.get("vram")) ?? p.vramGb;
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
  if (q.has("legacy")) p.legacy = q.get("legacy") === "1";
  if (q.has("osr")) p.osReserveGb = num(q.get("osr")) ?? null;
  return p;
}

/** Build the estimator's hardware description from a profile + catalog. */
export function toHardware(p: Profile, cat: Pick<Catalog, "gpus" | "chips">): Hardware | null {
  const ramBw = ramBandwidthGbs(p.ramMts, p.ramChannels);
  const threads = p.cpuThreads ?? undefined;
  if (p.mode === "pc") {
    const g = cat.gpus.find((x) => x.id === p.gpuId);
    if (!g) return null;
    return { kind: "discrete", id: g.id, name: g.name, vendor: g.vendor, vramGb: p.vramGb, bandwidthGbs: g.bandwidthGbs, ramGb: p.ramGb, ramBandwidthGbs: ramBw, cpuThreads: threads };
  }
  if (p.mode === "unified") {
    const c = cat.chips.find((x) => x.id === p.chipId);
    if (!c) return null;
    return { kind: "unified", id: c.id, name: c.name, vendor: c.vendor, memoryGb: p.memoryGb, bandwidthGbs: c.bandwidthGbs, cpuThreads: threads };
  }
  return { kind: "cpu", id: "cpu", name: "CPU only", ramGb: p.ramGb, ramBandwidthGbs: ramBw, cpuThreads: threads };
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
