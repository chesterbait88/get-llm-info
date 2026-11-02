/** Sorting + inclusion filters for the results list. Pure; unit-tested. */
import { rankResults, type ModelResult } from "./estimator";

export const SORT_KEYS = ["recommended", "speed", "params", "memory", "released", "context", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, { label: string; asc: string; desc: string; natural: SortDir }> = {
  recommended: { label: "Best match", desc: "Best first", asc: "Worst first", natural: "desc" },
  speed: { label: "Output speed", desc: "Fastest first", asc: "Slowest first", natural: "desc" },
  params: { label: "Model size", desc: "Largest first", asc: "Smallest first", natural: "desc" },
  memory: { label: "Memory needed", desc: "Most first", asc: "Least first", natural: "asc" },
  released: { label: "Release date", desc: "Newest first", asc: "Oldest first", natural: "desc" },
  context: { label: "Context length", desc: "Longest first", asc: "Shortest first", natural: "desc" },
  name: { label: "Name", desc: "Z to A", asc: "A to Z", natural: "asc" },
};

type Value = number | string | null;
const valueOf: Record<Exclude<SortKey, "recommended">, (r: ModelResult) => Value> = {
  speed: (r) => r.pick.tps,
  params: (r) => r.model.totalParamsB,
  memory: (r) => r.pick.totalGb,
  released: (r) => r.model.releaseDate,
  context: (r) => r.model.contextNative,
  name: (r) => r.model.name.toLowerCase(),
};

/** Sort by key and direction. Missing values (no speed, unknown date) always go last. */
export function sortResults(results: ModelResult[], key: SortKey, dir: SortDir): ModelResult[] {
  if (key === "recommended") {
    const ranked = rankResults(results);
    return dir === "desc" ? ranked : ranked.reverse();
  }
  const get = valueOf[key];
  const sign = dir === "asc" ? 1 : -1;
  return [...results].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return a.model.name.localeCompare(b.model.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp * sign || a.model.name.localeCompare(b.model.name);
  });
}

export interface Inclusion {
  showSlow: boolean;
  showNoFit: boolean;
}

export function includeResults(results: ModelResult[], inc: Inclusion): ModelResult[] {
  return results.filter((r) => {
    if (r.pick.tier === "wont-fit") return inc.showNoFit;
    if (r.pick.verdict === "slow") return inc.showSlow;
    return true;
  });
}
