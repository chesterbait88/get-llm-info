import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { checkSubmission, SubmissionInput } from "./submission";

const cat = loadSeedCatalog();
const base = SubmissionInput.parse({
  hardwareId: "nvidia-rtx-3090",
  hardwareKind: "gpu",
  modelId: "qwen3-30b-a3b",
  quant: "Q4_K_M",
  engine: "llamacpp",
  tgTps: 115,
  rawOutput: "| model | ... | tg128 | 115.2 ± 0.4 |",
});

describe("checkSubmission", () => {
  it("accepts a plausible run", () => {
    expect(checkSubmission(base, cat)).toEqual({ ok: true, flags: [] });
  });
  it("rejects runs above the bandwidth ceiling", () => {
    const r = checkSubmission({ ...base, tgTps: 900 }, cat);
    expect(r.ok).toBe(false);
  });
  it("flags modded VRAM and missing raw output", () => {
    const r = checkSubmission({ ...base, vramGb: 48, hardwareId: "nvidia-rtx-4090", rawOutput: null }, cat);
    expect(r).toEqual({ ok: true, flags: ["non-stock-vram", "no-raw-output"] });
  });
  it("rejects unknown references", () => {
    expect(checkSubmission({ ...base, modelId: "nope" }, cat).ok).toBe(false);
  });
});
