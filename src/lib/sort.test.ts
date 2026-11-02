import { describe, expect, it } from "vitest";
import { loadSeedCatalog } from "@/db/seed";
import { DEFAULT_SETTINGS, evaluateModel, ramBandwidthGbs, type Hardware } from "./estimator";
import { includeResults, sortResults } from "./sort";

const cat = loadSeedCatalog();
const hw: Hardware = { kind: "discrete", id: "nvidia-rtx-3090", name: "RTX 3090", vendor: "nvidia", vramGb: 24, bandwidthGbs: 936, ramGb: 32, ramBandwidthGbs: ramBandwidthGbs(6000, 2), cpu: { cores: 8, avx512: true } };
const results = cat.models.map((m) => evaluateModel(m, hw, { ...DEFAULT_SETTINGS, engine: cat.engines[0] }, cat));

describe("sortResults", () => {
  it("sorts by speed both ways, models that won't fit last either way", () => {
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortResults(results, "speed", dir);
      const speeds = sorted.map((r) => r.pick.tps);
      const firstNull = speeds.indexOf(null);
      expect(firstNull).toBeGreaterThan(0);
      expect(speeds.slice(firstNull).every((s) => s === null)).toBe(true);
      const known = speeds.slice(0, firstNull) as number[];
      const expected = [...known].sort((a, b) => (dir === "asc" ? a - b : b - a));
      expect(known).toEqual(expected);
    }
  });
  it("sorts by name A to Z", () => {
    const names = sortResults(results, "name", "asc").map((r) => r.model.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it("puts unknown release dates last", () => {
    const sorted = sortResults(results, "released", "desc");
    const firstUnknown = sorted.findIndex((r) => !r.model.releaseDate);
    expect(sorted.slice(firstUnknown).every((r) => !r.model.releaseDate)).toBe(true);
  });
  it("reverses the recommended ranking", () => {
    const desc = sortResults(results, "recommended", "desc").map((r) => r.model.id);
    const asc = sortResults(results, "recommended", "asc").map((r) => r.model.id);
    expect(asc).toEqual([...desc].reverse());
  });
});

describe("includeResults", () => {
  it("hides slow and non-fitting models on request", () => {
    const all = includeResults(results, { showSlow: true, showNoFit: true });
    const fast = includeResults(results, { showSlow: false, showNoFit: false });
    expect(all.length).toBe(results.length);
    expect(fast.every((r) => r.pick.tier !== "wont-fit" && r.pick.verdict !== "slow")).toBe(true);
    expect(fast.length).toBeLessThan(all.length);
  });
});
