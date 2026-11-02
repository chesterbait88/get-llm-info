import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { DEFAULT_PROFILE, fromQuery, toHardware, toQuery, type Profile } from "./profile";

const cat = loadSeedCatalog();

describe("profile <-> URL", () => {
  it("round-trips a PC profile", () => {
    const p: Profile = { ...DEFAULT_PROFILE, gpuId: "nvidia-rtx-3090", vramGb: 24, ramGb: 64, use: "coding", engine: "ollama" };
    const q = toQuery(p);
    expect(q).toContain("gpu=nvidia-rtx-3090");
    expect(q).toContain("ram=64");
    expect(fromQuery(q)).toEqual(p);
  });
  it("round-trips a Mac profile and omits PC fields", () => {
    const p: Profile = { ...DEFAULT_PROFILE, mode: "unified", chipId: "apple-m3-max-40", memoryGb: 128, ctx: 32768 };
    const q = toQuery(p);
    expect(q).not.toContain("gpu=");
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
    expect(hw).toMatchObject({ kind: "discrete", vramGb: 16, bandwidthGbs: 288, ramBandwidthGbs: 51.2 });
    expect(toHardware({ ...DEFAULT_PROFILE, gpuId: "nope" }, cat)).toBeNull();
  });
});
