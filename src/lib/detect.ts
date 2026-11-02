/**
 * Browser hardware probes. The browser can usually tell the GPU vendor and often
 * the exact card, but never VRAM and never exact RAM, so detection only pre-fills
 * the form and the user confirms.
 */
import type { Catalog } from "./schema";
import { matchRenderer, vendorFromWebGpu } from "./match";
import type { Profile } from "./profile";

export interface Probe {
  webgpu: { vendor: string; architecture: string; device: string; description: string } | null;
  renderer: string | null;
  deviceMemoryGb: number | null;
  threads: number | null;
  platform: string | null;
  architecture: string | null;
}

/** Run all probes silently; every probe is optional and failures are swallowed. */
export async function probeBrowser(): Promise<Probe> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<{ info?: Record<string, string>; requestAdapterInfo?: () => Promise<Record<string, string>> } | null> };
    deviceMemory?: number;
    userAgentData?: { platform?: string; getHighEntropyValues?(h: string[]): Promise<Record<string, string>> };
  };
  const probe: Probe = {
    webgpu: null,
    renderer: null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    threads: nav.hardwareConcurrency || null,
    platform: nav.userAgentData?.platform ?? null,
    architecture: null,
  };
  try {
    const adapter = await nav.gpu?.requestAdapter();
    const info = adapter?.info ?? (await adapter?.requestAdapterInfo?.());
    if (info) {
      probe.webgpu = {
        vendor: info.vendor ?? "",
        architecture: info.architecture ?? "",
        device: info.device ?? "",
        description: info.description ?? "",
      };
    }
  } catch {
    /* WebGPU unavailable */
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      probe.renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "") || null;
    }
  } catch {
    /* WebGL unavailable */
  }
  try {
    const hi = await nav.userAgentData?.getHighEntropyValues?.(["architecture", "platform"]);
    if (hi) {
      probe.architecture = hi.architecture ?? null;
      probe.platform = hi.platform ?? probe.platform;
    }
  } catch {
    /* Chromium only */
  }
  return probe;
}

export interface Suggestion {
  patch: Partial<Profile>;
  /** Human-readable "we think you have" line. */
  summary: string;
  confidence: "exact" | "family" | "none";
  /** Other catalog entries that match equally well (e.g. M3 Max 30/40-core). */
  alternatives: { id: string; name: string }[];
  /** Vendor to pre-select when the exact card is unknown. */
  vendor: "nvidia" | "amd" | "intel" | "apple" | null;
  /** Logical CPU threads the browser reports (it never reveals the CPU model). */
  threads: number | null;
}

/** Turn raw probes into a profile patch. Pure, so it is unit-tested. */
export function suggestFromProbe(p: Probe, cat: Pick<Catalog, "gpus" | "chips">): Suggestion {
  const threads = p.threads ?? null;
  const candidates = [p.renderer, p.webgpu?.description, p.webgpu?.device].filter(Boolean) as string[];
  for (const s of candidates) {
    const m = matchRenderer(s, cat.gpus, cat.chips);
    if (m?.type === "gpu") {
      return {
        patch: { mode: "pc", gpuId: m.gpu.id, vramGb: m.gpu.vramGb[0], vramCustom: false },
        summary: `${m.gpu.name} (${m.gpu.vramGb.join(" / ")} GB)`,
        confidence: "exact",
        alternatives: [],
        vendor: m.gpu.vendor,
        threads,
      };
    }
    if (m?.type === "chip") {
      const mem = m.chip.memoryOptionsGb;
      return {
        patch: { mode: "unified", chipId: m.chip.id, memoryGb: mem[Math.min(1, mem.length - 1)] },
        summary: m.chip.name,
        confidence: "exact",
        alternatives: m.alternatives.map((c) => ({ id: c.id, name: c.name })),
        vendor: m.chip.vendor === "apple" ? "apple" : null,
        threads,
      };
    }
  }
  const vendor =
    vendorFromWebGpu(p.webgpu?.vendor) ??
    vendorFromWebGpu(p.renderer) ??
    (/mac/i.test(p.platform ?? "") && /arm/i.test(p.architecture ?? "") ? "apple" : null);
  if (vendor === "apple") {
    return {
      patch: { mode: "unified" },
      summary: "an Apple Silicon Mac (pick your chip)",
      confidence: "family",
      alternatives: [],
      vendor,
      threads,
    };
  }
  if (vendor) {
    const arch = p.webgpu?.architecture ? ` (${p.webgpu.architecture})` : "";
    return {
      patch: { mode: "pc" },
      summary: `an ${vendor.toUpperCase()} GPU${arch} — pick the exact card`,
      confidence: "family",
      alternatives: [],
      vendor,
      threads,
    };
  }
  return { patch: {}, summary: "", confidence: "none", alternatives: [], vendor: null, threads };
}
