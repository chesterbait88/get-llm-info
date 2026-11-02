import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import {
  DEFAULT_SETTINGS,
  type Hardware,
  type Settings,
  calibrationFor,
  estimate,
  evaluateModel,
  kvCacheGb,
  pickQuant,
  ramBandwidthGbs,
  weightsGb,
} from "./estimator";

const cat = loadSeedCatalog();
const engine = (id: string) => cat.engines.find((e) => e.id === id)!;
const model = (id: string) => cat.models.find((m) => m.id === id)!;
const quant = (id: string) => cat.quants.find((q) => q.id === id)!;
const gpu = (id: string) => cat.gpus.find((g) => g.id === id)!;
const chip = (id: string) => cat.chips.find((c) => c.id === id)!;
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, engine: engine("llamacpp"), ...over });

function pc(gpuId: string, ramGb = 32, ramMts = 3200): Hardware {
  const g = gpu(gpuId);
  return { kind: "discrete", id: g.id, name: g.name, vendor: g.vendor, vramGb: g.vramGb[0], bandwidthGbs: g.bandwidthGbs, ramGb, ramBandwidthGbs: ramBandwidthGbs(ramMts, 2) };
}
function mac(chipId: string, memoryGb: number): Hardware {
  const c = chip(chipId);
  return { kind: "unified", id: c.id, name: c.name, vendor: c.vendor, memoryGb, bandwidthGbs: c.bandwidthGbs };
}

describe("basic math", () => {
  it("matches the brief's weight table", () => {
    expect(weightsGb(8, 4.9)).toBeCloseTo(4.9, 1);
    expect(weightsGb(27, 6.6)).toBeCloseTo(22.3, 1);
  });
  it("computes RAM bandwidth", () => {
    expect(ramBandwidthGbs(3200, 2)).toBeCloseTo(51.2);
    expect(ramBandwidthGbs(6000, 2)).toBeCloseTo(96);
  });
  it("computes Llama 3.1 8B KV cache at 8K (F16) ≈ 1.07 GB", () => {
    expect(kvCacheGb(model("llama-3.1-8b").attention, 8192, 2)).toBeCloseTo(1.07, 2);
  });
  it("caps sliding-window layers at the window", () => {
    const att = { fullLayers: 0, slidingLayers: 10, window: 1024, kvHeads: 8, headDim: 128 };
    expect(kvCacheGb(att, 32768, 2)).toBeCloseTo(kvCacheGb(att, 1024, 2));
  });
});

describe("acceptance checks from the brief", () => {
  it("RTX 3090 + Qwen 3.6 35B-A3B Q4 lands near measured 30B-A3B (~110-120), not the ~260 ceiling", () => {
    const hw = pc("nvidia-rtx-3090");
    for (const id of ["qwen-3.6-35b-a3b", "qwen3-30b-a3b"]) {
      const e = estimate(model(id), quant("Q4_K_M"), hw, settings());
      // 35B-A3B Q4_K_M is ~22 GB of weights: at 8K it is a hair over usable VRAM.
      expect(["full-gpu", "partial"]).toContain(e.tier);
      expect(e.gpuFraction === 0 || e.gpuFraction > 0.99).toBe(true);
      expect(e.tps!).toBeGreaterThan(95);
      expect(e.tps!).toBeLessThan(145);
    }
  });

  it("M3 Max + 7B Q4_0 is within 15% of the measured 66.3 tok/s (uncalibrated)", () => {
    const e = estimate(model("llama-2-7b"), quant("Q4_0"), mac("apple-m3-max-40", 64), settings({ depthTokens: 0 }));
    expect(Math.abs(e.tps! - 66.3) / 66.3).toBeLessThan(0.15);
  });

  it("a 24 GB card shows Llama 3.3 70B as partial offload at low single-digit tok/s", () => {
    const r = evaluateModel(model("llama-3.3-70b"), pc("nvidia-rtx-3090", 64), settings(), cat);
    expect(r.pick.tier).toBe("partial");
    expect(r.pick.quant).toBe("Q4_K_M");
    expect(r.pick.tps!).toBeGreaterThan(0.5);
    expect(r.pick.tps!).toBeLessThan(5);
  });
});

describe("fit tiers", () => {
  it("8B on a 12 GB card runs fully on GPU and steps up quality", () => {
    const r = evaluateModel(model("llama-3.1-8b"), pc("nvidia-rtx-4070"), settings(), cat);
    expect(r.pick.tier).toBe("full-gpu");
    expect(r.pick.bitsPerWeight).toBeGreaterThan(4.9);
  });
  it("speed preference keeps Q4_K_M", () => {
    const r = evaluateModel(model("llama-3.1-8b"), pc("nvidia-rtx-4070"), settings({ preference: "speed" }), cat);
    expect(r.pick.quant).toBe("Q4_K_M");
  });
  it("Kimi K3 won't fit on a 128 GB Mac and reports a shortfall", () => {
    const r = evaluateModel(model("kimi-k3"), mac("apple-m4-max-40", 128), settings(), cat);
    expect(r.pick.tier).toBe("wont-fit");
    expect(r.pick.shortfallGb).toBeGreaterThan(1000);
  });
  it("gpt-oss-120b fits a 128 GB unified machine", () => {
    const r = evaluateModel(model("gpt-oss-120b"), mac("nvidia-dgx-spark", 128), settings(), cat);
    expect(r.pick.tier).toBe("unified");
    expect(r.pick.tps!).toBeGreaterThan(20);
  });
  it("vLLM refuses to offload to system RAM", () => {
    const e = estimate(model("llama-3.3-70b"), quant("Q4_K_M"), pc("nvidia-rtx-3090", 128), settings({ engine: engine("vllm") }));
    expect(e.tier).toBe("wont-fit");
  });
  it("MLX is unavailable on a PC", () => {
    const e = estimate(model("llama-3.1-8b"), quant("Q4_K_M"), pc("nvidia-rtx-3090"), settings({ engine: engine("mlx") }));
    expect(e.tier).toBe("wont-fit");
  });
  it("CPU-only runs at system-RAM speed", () => {
    const hw: Hardware = { kind: "cpu", id: "cpu", name: "CPU", ramGb: 32, ramBandwidthGbs: ramBandwidthGbs(6000, 2) };
    const e = estimate(model("llama-3.1-8b"), quant("Q4_K_M"), hw, settings());
    expect(e.tier).toBe("cpu");
    expect(e.tps!).toBeGreaterThan(5);
    expect(e.tps!).toBeLessThan(15);
  });
  it("caps context at the model's native window", () => {
    const e = estimate(model("phi-4"), quant("Q4_K_M"), pc("nvidia-rtx-4090"), settings({ contextTokens: 131072 }));
    expect(e.contextTokens).toBe(16384);
  });
});

describe("measured data", () => {
  it("prefers a measured benchmark over the estimate", () => {
    const r = evaluateModel(model("llama-2-7b"), mac("apple-m3-max-40", 64), settings(), cat);
    const q40 = r.all.find((e) => e.quant === "Q4_0")!;
    expect(q40.speedKind).toBe("measured");
    expect(q40.tps).toBeCloseTo(66.31);
  });
  it("scales a llama.cpp measurement by the engine factor for other engines", () => {
    const r = evaluateModel(model("llama-2-7b"), mac("apple-m3-max-40", 64), settings({ engine: engine("ollama") }), cat);
    expect(r.all.find((e) => e.quant === "Q4_0")!.speedKind).toBe("derived");
  });
  it("calibrates a device from its measurements", () => {
    const hw = mac("apple-m2-ultra", 192);
    const { factor, samples } = calibrationFor(hw, settings(), cat, engine("llamacpp"));
    expect(samples).toBe(1);
    const raw = estimate(model("llama-2-7b"), quant("Q4_0"), hw, settings({ depthTokens: 0 })).tps!;
    expect(raw * factor).toBeCloseTo(94.27, 0);
  });
});

describe("pickQuant", () => {
  it("returns the smallest quant when nothing fits", () => {
    const r = evaluateModel(model("deepseek-v4-pro"), pc("nvidia-rtx-4060"), settings(), cat);
    expect(r.pick.quant).toBe("Q3_K_M");
    expect(pickQuant(r.all.filter((e) => e.quant !== "Q4_0"), "quality").tier).toBe("wont-fit");
  });
});

describe("squeeze quants", () => {
  it("only picks Q3_K_M when nothing at Q4+ fits or it strictly improves the verdict (whole catalog)", () => {
    const rank = { instant: 0, comfortable: 1, usable: 2, slow: 3 } as const;
    const machines = [pc("nvidia-rtx-4070"), pc("nvidia-rtx-3090", 64), pc("nvidia-rtx-4060", 16), mac("apple-m4-pro", 48), mac("apple-m1", 16)];
    for (const hw of machines) {
      for (const m of cat.models) {
        const r = evaluateModel(m, hw, settings(), cat);
        if (r.pick.quant !== "Q3_K_M" || r.pick.tier === "wont-fit") continue;
        const standard = r.all.filter((e) => e.bitsPerWeight >= 4.9 && e.tier !== "wont-fit" && e.verdict);
        for (const e of standard) expect(rank[r.pick.verdict!]).toBeLessThan(rank[e.verdict!]);
      }
    }
  });
  it("drops to Q3_K_M when that moves the model fully onto the GPU and up a verdict", () => {
    const r = evaluateModel(model("hermes-4.3-36b"), pc("nvidia-rtx-3090"), settings(), cat);
    const q4 = r.all.find((e) => e.quant === "Q4_K_M")!;
    expect(q4.tier).toBe("partial");
    expect(r.pick.quant).toBe("Q3_K_M");
    expect(r.pick.tier).toBe("full-gpu");
  });
});
