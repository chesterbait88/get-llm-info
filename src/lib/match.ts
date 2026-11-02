/**
 * Map a WebGL/WebGPU renderer string to catalog hardware. Pure + deterministic.
 *
 * Example inputs:
 *   "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002860) Direct3D11 vs_5_0 ps_5_0, D3D11)"
 *   "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)"
 *   "AMD Radeon RX 7900 XTX (radeonsi, navi31, LLVM 17.0.6, DRM 3.54)"
 */
import type { Chip, Gpu } from "./schema";

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(tm\)|\(r\)|™|®/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SUFFIX = "(?: ?(ti super|ti|super))?";

/** Extract a catalog match key such as "rtx 4070 ti super", "rx 7900 xtx", "arc b580". */
export function extractGpuKey(renderer: string): string | null {
  const s = normalise(renderer);
  const laptop = /\b(laptop|mobile|max q)\b/.test(s) ? " laptop" : "";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\brtx pro (\d{4})\b/))) return `rtx pro ${m[1]}`;
  if ((m = s.match(/\brtx (\d{4}) ada\b/))) return `rtx ${m[1]} ada`;
  if ((m = s.match(/\brtx a(\d{4})\b/))) return `rtx a${m[1]}`;
  if ((m = s.match(new RegExp(`\\b(rtx|gtx) ?(\\d{4})${SUFFIX}\\b`)))) {
    return `${m[1]} ${m[2]}${m[3] ? " " + m[3] : ""}${laptop}`;
  }
  if ((m = s.match(/\bradeon ai pro r(\d{4})\b/))) return `ai pro r${m[1]}`;
  if ((m = s.match(/\brx ?(\d{4})(?: ?(xtx|xt|gre))?\b/))) return `rx ${m[1]}${m[2] ? " " + m[2] : ""}`;
  if ((m = s.match(/\barc (pro )?([ab]\d{2,3})\b/))) return `arc ${m[1] ?? ""}${m[2]}`;
  if ((m = s.match(/\bradeon (\d{4}s)\b/))) return `radeon ${m[1]}`;
  if ((m = s.match(/\b(gb10|l40s|a100|h100)\b/))) return m[1];
  return null;
}

/** "apple m3 max" style key, or null. */
export function extractAppleChipKey(renderer: string): string | null {
  const m = normalise(renderer).match(/\bapple m(\d)(?: (pro|max|ultra))?\b/);
  return m ? `apple m${m[1]}${m[2] ? " " + m[2] : ""}` : null;
}

export type HardwareMatch =
  | { type: "gpu"; gpu: Gpu; key: string }
  | { type: "chip"; chip: Chip; alternatives: Chip[]; key: string }
  | null;

export function matchRenderer(renderer: string | null | undefined, gpus: Gpu[], chips: Chip[]): HardwareMatch {
  if (!renderer) return null;
  const appleKey = extractAppleChipKey(renderer);
  if (appleKey) {
    const found = chips.filter((c) => c.matchKeys.includes(appleKey));
    if (found.length) return { type: "chip", chip: found[0], alternatives: found.slice(1), key: appleKey };
  }
  const key = extractGpuKey(renderer);
  if (!key) return null;
  const chipHits = chips.filter((c) => c.matchKeys.includes(key));
  if (chipHits.length) return { type: "chip", chip: chipHits[0], alternatives: chipHits.slice(1), key };
  const stock = gpus.filter((g) => !g.isModded);
  const gpu =
    stock.find((g) => g.matchKeys.includes(key)) ??
    // A laptop chip we don't list separately: fall back to the desktop entry.
    stock.find((g) => g.matchKeys.includes(key.replace(/ laptop$/, "")));
  return gpu ? { type: "gpu", gpu, key } : null;
}

/** Map a WebGPU vendor string onto our vendor ids. */
export function vendorFromWebGpu(vendor: string | undefined | null): "nvidia" | "amd" | "intel" | "apple" | null {
  const v = (vendor ?? "").toLowerCase();
  if (v.includes("nvidia")) return "nvidia";
  if (v.includes("amd") || v.includes("ati")) return "amd";
  if (v.includes("intel")) return "intel";
  if (v.includes("apple")) return "apple";
  return null;
}
