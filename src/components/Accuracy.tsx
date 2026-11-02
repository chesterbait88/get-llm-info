"use client";

import { useMemo } from "react";
import type { Catalog } from "@/lib/schema";
import { DEFAULT_SETTINGS, estimate, type Hardware } from "@/lib/estimator";
import { fmtTps } from "@/lib/format";

/** Estimate (uncalibrated) vs measured for every benchmark we hold: the η calibration report. */
export function Accuracy({ catalog }: { catalog: Catalog }) {
  const rows = useMemo(() => {
    const llama = catalog.engines.find((e) => e.id === "llamacpp")!;
    return catalog.benchmarks.flatMap((b) => {
      const model = catalog.models.find((m) => m.id === b.modelId);
      const quant = catalog.quants.find((q) => q.id === b.quant);
      const engine = catalog.engines.find((e) => e.id === b.engine) ?? llama;
      let hw: Hardware | null = null;
      if (b.hardwareKind === "chip") {
        const c = catalog.chips.find((x) => x.id === b.hardwareId);
        if (c) hw = { kind: "unified", id: c.id, name: c.name, vendor: c.vendor, memoryGb: Math.max(...c.memoryOptionsGb), bandwidthGbs: c.bandwidthGbs };
      } else {
        const g = catalog.gpus.find((x) => x.id === b.hardwareId);
        if (g) hw = { kind: "discrete", id: g.id, name: g.name, vendor: g.vendor, vramGb: Math.max(...g.vramGb), bandwidthGbs: g.bandwidthGbs, ramGb: 64, ramBandwidthGbs: 96 };
      }
      if (!model || !quant || !hw) return [];
      const est = estimate(model, quant, hw, { ...DEFAULT_SETTINGS, engine, depthTokens: b.contextDepth, contextTokens: Math.max(512, b.contextDepth) });
      if (est.tps == null) return [];
      return [{ b, hw, model, est: est.tps, err: (est.tps - b.tgTps) / b.tgTps }];
    });
  }, [catalog]);

  if (!rows.length) return null;
  const mape = rows.reduce((s, r) => s + Math.abs(r.err), 0) / rows.length;

  return (
    <details className="border-t border-rule pt-4">
      <summary className="cursor-pointer text-[17px] font-semibold text-board">
        How accurate are the estimates?{" "}
        <span className="font-normal text-muted">
          Off by {(mape * 100).toFixed(0)}% on average across {rows.length} measured runs.
        </span>
      </summary>
      <p className="mt-2 text-sm text-muted">
        The plain formula next to measured llama.cpp results. On chips with measurements, estimates for every other model are adjusted by this gap. Results marked * were copied from the source and haven&apos;t been re-checked.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="t-data w-full min-w-[480px] text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Hardware</th>
              <th className="py-1 pr-3 font-medium">Model</th>
              <th className="py-1 pr-3 text-right font-medium">Measured</th>
              <th className="py-1 pr-3 text-right font-medium">Estimated</th>
              <th className="py-1 text-right font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, hw, model, est, err }) => (
              <tr key={`${b.hardwareId}-${b.modelId}-${b.quant}`} className="border-t border-rule">
                <td className="py-1 pr-3">{hw.name}</td>
                <td className="py-1 pr-3">
                  {model.name} {b.quant}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  <a className="underline decoration-dotted" href={b.sourceUrl} target="_blank" rel="noreferrer">
                    {fmtTps(b.tgTps)}
                  </a>
                  {!b.verified && " *"}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtTps(est)}</td>
                <td className="py-1 text-right tabular-nums" style={{ color: Math.abs(err) > 0.15 ? "var(--color-usable)" : undefined }}>
                  {err > 0 ? "+" : ""}
                  {(err * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
