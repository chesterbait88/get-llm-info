import type { Model } from "./schema";
import type { QuantEstimate, Tier, Verdict } from "./estimator";

export const fmtGb = (gb: number) => (gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`);

export function fmtTps(tps: number | null): string {
  if (tps == null) return "—";
  if (tps >= 100) return Math.round(tps).toString();
  if (tps >= 10) return tps.toFixed(0);
  return tps.toFixed(1);
}

export function fmtParams(m: Model): string {
  const b = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}T` : `${n % 1 === 0 ? n : n.toFixed(n < 10 ? 1 : 0)}B`);
  if (m.arch === "moe") return `${b(m.totalParamsB)} · ${b(m.activeParamsB)} active`;
  if (m.activeParamsB < m.totalParamsB) return `${b(m.totalParamsB)} · ${b(m.activeParamsB)} effective`;
  return b(m.totalParamsB);
}

export function fmtContext(tokens: number | null): string {
  if (!tokens) return "?";
  if (tokens >= 1024 * 1024) return `${Math.round(tokens / (1024 * 1024))}M`;
  return `${Math.round(tokens / 1024)}K`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  instant: "Instant",
  comfortable: "Comfortable",
  usable: "Usable",
  slow: "Slow",
};

export const VERDICT_COLOR: Record<Verdict | "nofit", string> = {
  instant: "var(--color-instant)",
  comfortable: "var(--color-comfortable)",
  usable: "var(--color-usable)",
  slow: "var(--color-slow)",
  nofit: "var(--color-nofit)",
};

export function tierLabel(e: QuantEstimate): string {
  const labels: Record<Tier, string> = {
    "full-gpu": "Full GPU",
    unified: "Unified memory",
    partial: `Partial offload · ${Math.floor(e.gpuFraction * 100)}% on GPU`,
    cpu: "CPU only",
    "wont-fit": "Won't fit",
  };
  return labels[e.tier];
}
