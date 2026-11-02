import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { suggestFromProbe, type Probe } from "./detect";

const cat = loadSeedCatalog();
const blank: Probe = { webgpu: null, renderer: null, deviceMemoryGb: null, threads: null, platform: null, architecture: null };

describe("suggestFromProbe", () => {
  it("Chrome on Windows/NVIDIA pre-fills the exact card", () => {
    const s = suggestFromProbe(
      { ...blank, renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)", threads: 16, deviceMemoryGb: 8 },
      cat,
    );
    expect(s.confidence).toBe("exact");
    expect(s.patch).toMatchObject({ mode: "pc", gpuId: "nvidia-rtx-4070", vramGb: 12 });
    expect(s.threads).toBe(16);
  });
  it("Chrome on an Apple Silicon Mac pre-fills the chip", () => {
    const s = suggestFromProbe(
      { ...blank, renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)", webgpu: { vendor: "apple", architecture: "metal-3", device: "", description: "" } },
      cat,
    );
    expect(s.patch).toMatchObject({ mode: "unified", chipId: "apple-m4-pro" });
  });
  it("Safari ('Apple GPU') falls back to the Mac flow via WebGPU vendor", () => {
    const s = suggestFromProbe({ ...blank, renderer: "Apple GPU", webgpu: { vendor: "apple", architecture: "", device: "", description: "" } }, cat);
    expect(s.confidence).toBe("family");
    expect(s.patch.mode).toBe("unified");
  });
  it("vendor-only detection pre-selects the vendor", () => {
    const s = suggestFromProbe({ ...blank, webgpu: { vendor: "amd", architecture: "rdna-3", device: "", description: "" } }, cat);
    expect(s).toMatchObject({ confidence: "family", vendor: "amd" });
    expect(s.summary).toContain("rdna-3");
  });
  it("nothing detected", () => {
    expect(suggestFromProbe(blank, cat).confidence).toBe("none");
  });
});
