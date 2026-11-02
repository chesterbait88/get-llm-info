import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { cpuDefaults, DEFAULT_PROFILE, fromQuery, OTHER_CPU, toHardware, toQuery, type Profile } from "./profile";

const cat = loadSeedCatalog();

describe("profile <-> URL", () => {
  it("round-trips a PC profile", () => {
    const p: Profile = { ...DEFAULT_PROFILE, cpuId: "intel-core-i7-14700k", gpuId: "nvidia-rtx-3090", vramGb: 24, ramGb: 64, use: "coding", engine: "ollama", sort: "speed", dir: "asc", showNoFit: true, showSlow: false };
    const q = toQuery(p);
    expect(q).toContain("gpu=nvidia-rtx-3090");
    expect(q).toContain("ram=64");
    expect(q).toContain("cpu=intel-core-i7-14700k");
    expect(fromQuery(q)).toEqual(p);
  });
  it("round-trips a Mac profile and omits PC fields", () => {
    const p: Profile = { ...DEFAULT_PROFILE, mode: "unified", chipId: "apple-m3-max-40", memoryGb: 128, ctx: 32768 };
    const q = toQuery(p);
    expect(q).not.toContain("gpu=");
    expect(q).not.toContain("cpu=");
    expect(fromQuery(q)).toEqual(p);
  });
  it("ignores junk values", () => {
    const p = fromQuery("mode=banana&ram=lots&engine=evil&use=chat");
    expect(p.mode).toBe(DEFAULT_PROFILE.mode);
    expect(p.ramGb).toBe(DEFAULT_PROFILE.ramGb);
    expect(p.engine).toBe("llamacpp");
    expect(p.use).toBe("chat");
  });
  it("builds hardware from a profile", () => {
    const hw = toHardware({ ...DEFAULT_PROFILE, gpuId: "nvidia-rtx-4060-ti", vramGb: 16, ramMts: 3200 }, cat);
    expect(hw).toMatchObject({ kind: "discrete", vramGb: 16, bandwidthGbs: 288, ramBandwidthGbs: 51.2, cpu: { cores: 8, avx512: true } });
    expect(toHardware({ ...DEFAULT_PROFILE, gpuId: "nope" }, cat)).toBeNull();
  });
  it("only uses non-stock VRAM when the override is on", () => {
    const base = { ...DEFAULT_PROFILE, gpuId: "nvidia-rtx-4090", vramGb: 48 };
    expect(toHardware({ ...base, vramCustom: false }, cat)).toMatchObject({ vramGb: 24 });
    expect(toHardware({ ...base, vramCustom: true }, cat)).toMatchObject({ vramGb: 48 });
  });
  it("uses typed-in cores for an unlisted CPU", () => {
    const hw = toHardware({ ...DEFAULT_PROFILE, mode: "cpu", cpuId: OTHER_CPU, cpuCores: 4 }, cat);
    expect(hw).toMatchObject({ kind: "cpu", cpu: { cores: 4, avx512: false } });
  });
  it("picking a CPU sets its platform's RAM defaults", () => {
    const cpu = cat.cpus.find((c) => c.id === "amd-threadripper-pro-7995wx")!;
    expect(cpuDefaults(cpu)).toEqual({ cpuId: cpu.id, ramType: "ddr5", ramMts: 5200, ramChannels: 8 });
  });
});
