import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { extractAppleChipKey, extractGpuKey, matchRenderer, vendorFromWebGpu } from "./match";

const { gpus, chips } = loadSeedCatalog();

describe("extractGpuKey", () => {
  it.each([
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)", "rtx 4070"],
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)", "rtx 4070 ti super"],
    ["NVIDIA GeForce RTX 4060Ti/PCIe/SSE2", "rtx 4060 ti"],
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002860) Direct3D11, D3D11)", "rtx 4070 laptop"],
    ["NVIDIA RTX PRO 6000 Blackwell Workstation Edition", "rtx pro 6000"],
    ["NVIDIA RTX 6000 Ada Generation", "rtx 6000 ada"],
    ["NVIDIA RTX A6000/PCIe/SSE2", "rtx a6000"],
    ["AMD Radeon RX 7900 XTX (radeonsi, navi31, LLVM 17.0.6)", "rx 7900 xtx"],
    ["ANGLE (AMD, AMD Radeon RX 9070 XT Direct3D11 vs_5_0 ps_5_0, D3D11)", "rx 9070 xt"],
    ["ANGLE (AMD, AMD Radeon(TM) 8060S Graphics Direct3D11, D3D11)", "radeon 8060s"],
    ["ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics Direct3D11, D3D11)", "arc b580"],
    ["Intel(R) Arc(TM) Pro B60 Graphics", "arc pro b60"],
    ["ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11, D3D11)", null],
  ])("%s -> %s", (input, key) => {
    expect(extractGpuKey(input)).toBe(key);
  });
});

describe("Apple", () => {
  it("reads the chip from Chrome's Metal renderer string", () => {
    expect(extractAppleChipKey("ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)")).toBe("apple m3 max");
    expect(extractAppleChipKey("Apple M4")).toBe("apple m4");
    expect(extractAppleChipKey("Apple GPU")).toBeNull();
  });
});

describe("matchRenderer", () => {
  it("matches an exact card", () => {
    const m = matchRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11)", gpus, chips);
    expect(m?.type === "gpu" && m.gpu.id).toBe("nvidia-rtx-4070");
  });
  it("does not confuse RTX 4070 with RTX 4070 Ti", () => {
    const m = matchRenderer("NVIDIA GeForce RTX 4070 Ti", gpus, chips);
    expect(m?.type === "gpu" && m.gpu.id).toBe("nvidia-rtx-4070-ti");
  });
  it("prefers laptop entries for laptop GPUs", () => {
    const m = matchRenderer("NVIDIA GeForce RTX 4090 Laptop GPU", gpus, chips);
    expect(m?.type === "gpu" && m.gpu.formFactor).toBe("laptop");
  });
  it("matches an Apple chip and offers GPU-core variants", () => {
    const m = matchRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)", gpus, chips);
    expect(m?.type).toBe("chip");
    if (m?.type === "chip") {
      expect(m.chip.id).toBe("apple-m3-max-40");
      expect(m.alternatives.map((c) => c.id)).toEqual(["apple-m3-max-30"]);
    }
  });
  it("maps Strix Halo graphics to the unified chip", () => {
    const m = matchRenderer("AMD Radeon(TM) 8060S Graphics", gpus, chips);
    expect(m?.type === "chip" && m.chip.id).toBe("amd-ryzen-ai-max-395");
  });
  it("never auto-selects modded cards", () => {
    const m = matchRenderer("NVIDIA GeForce RTX 4090", gpus, chips);
    expect(m?.type === "gpu" && m.gpu.isModded).toBe(false);
  });
  it("returns null for unknown or generic strings", () => {
    expect(matchRenderer("Apple GPU", gpus, chips)).toBeNull();
    expect(matchRenderer(undefined, gpus, chips)).toBeNull();
  });
  it("maps WebGPU vendors", () => {
    expect(vendorFromWebGpu("nvidia")).toBe("nvidia");
    expect(vendorFromWebGpu("apple")).toBe("apple");
    expect(vendorFromWebGpu("")).toBeNull();
  });
});
