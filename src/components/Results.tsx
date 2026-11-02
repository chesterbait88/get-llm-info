"use client";

import { useState } from "react";
import type { ModelResult, QuantEstimate } from "@/lib/estimator";
import { fmtContext, fmtGb, fmtParams, fmtTps, tierLabel, VERDICT_COLOR, VERDICT_LABEL } from "@/lib/format";
import { CopyButton, Tag } from "./ui";

export function Results({ results, calibrationSamples, requestedCtx }: { results: ModelResult[]; calibrationSamples: number; requestedCtx: number }) {
  if (!results.length) {
    return <p className="py-10 text-center text-[var(--color-muted)]">No models match these filters.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {results.map((r) => (
        <ResultRow key={r.model.id} r={r} calibrationSamples={calibrationSamples} requestedCtx={requestedCtx} />
      ))}
    </ul>
  );
}

function SpeedLabel({ e, calibrationSamples }: { e: QuantEstimate; calibrationSamples: number }) {
  if (e.tps == null) return null;
  if (e.speedKind === "measured" && e.benchmark) {
    return (
      <span>
        Measured ·{" "}
        <a className="underline decoration-dotted" href={e.benchmark.sourceUrl} target="_blank" rel="noreferrer">
          {e.benchmark.sourceLabel}
        </a>
        {!e.benchmark.verified && <span title="Transcribed from the source; pending re-check"> *</span>}
      </span>
    );
  }
  if (e.speedKind === "derived") return <span>From a measured llama.cpp run × engine factor</span>;
  const range = `${fmtTps(e.tpsLow)}–${fmtTps(e.tpsHigh)}`;
  return (
    <span>
      Estimated · {range}
      {calibrationSamples > 0 && <span title="Scaled by measured runs on this exact device"> · calibrated</span>}
    </span>
  );
}

function ResultRow({ r, calibrationSamples, requestedCtx }: { r: ModelResult; calibrationSamples: number; requestedCtx: number }) {
  const [open, setOpen] = useState(false);
  const { model: m, pick } = r;
  const color = pick.verdict ? VERDICT_COLOR[pick.verdict] : VERDICT_COLOR.nofit;
  const fits = pick.tier !== "wont-fit";

  return (
    <li className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]" style={{ borderLeft: `4px solid ${color}` }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid w-full grid-cols-1 gap-3 p-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold">{m.name}</span>
            <span className="text-sm text-[var(--color-muted)]">{m.lab}</span>
            <span className="text-sm text-[var(--color-muted)]">· {fmtParams(m)}</span>
            <span className="text-sm text-[var(--color-muted)]">· {fmtContext(m.contextNative)} ctx</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.useCases.map((u) => (
              <Tag key={u}>{u}</Tag>
            ))}
            <Tag title={m.license}>{m.licenseClass === "permissive" ? "permissive" : m.licenseClass === "restricted" ? "restricted licence" : "licence ?"}</Tag>
            {m.modalities.filter((x) => x !== "text" && !(m.useCases as string[]).includes(x)).map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 sm:justify-end">
          <div className="text-left sm:text-right">
            <div className="text-sm text-[var(--color-muted)]">
              {fits ? `${pick.quant} · ${fmtGb(pick.totalGb)}` : `Needs ~${fmtGb(pick.totalGb)}`}
            </div>
            <div className="text-xs text-[var(--color-muted)]">{fits ? tierLabel(pick) : `${fmtGb(pick.shortfallGb)} short`}</div>
          </div>
          <div className="w-28 text-right">
            {fits ? (
              <>
                <div className="text-xl font-semibold tabular-nums" style={{ color }}>
                  {pick.speedKind === "estimated" ? "~" : ""}
                  {fmtTps(pick.tps)} <span className="text-sm font-normal">tok/s</span>
                </div>
                <div className="text-xs font-medium" style={{ color }}>
                  {VERDICT_LABEL[pick.verdict!]}
                </div>
              </>
            ) : (
              <div className="text-sm font-medium text-[var(--color-nofit)]">Won&apos;t fit</div>
            )}
          </div>
        </div>
      </button>
      {fits && (
        <div className="-mt-1 px-3 pb-2 text-xs text-[var(--color-muted)] sm:px-4">
          <SpeedLabel e={pick} calibrationSamples={calibrationSamples} />
          {pick.tier === "partial" && <> · +{fmtGb(pick.shortfallGb)} VRAM would run it fully on GPU</>}
          {pick.contextTokens < requestedCtx && <> · context capped at the model&apos;s {fmtContext(m.contextNative)}</>}
        </div>
      )}
      {open && <Details r={r} calibrationSamples={calibrationSamples} />}
    </li>
  );
}

function Details({ r, calibrationSamples }: { r: ModelResult; calibrationSamples: number }) {
  const m = r.model;
  return (
    <div className="border-t border-[var(--color-line)] px-3 py-3 text-sm sm:px-4">
      {m.note && <p className="mb-2 text-[var(--color-muted)]">{m.note}</p>}
      {m.archSource === "estimated" && (
        <p className="mb-2 text-xs text-[var(--color-usable)]">Layer/attention layout not yet verified against config.json, so the KV-cache size is approximate.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs text-[var(--color-muted)]">
            <tr>
              <th className="py-1 pr-3 font-medium">Quant</th>
              <th className="py-1 pr-3 font-medium">Memory</th>
              <th className="py-1 pr-3 font-medium">Where it runs</th>
              <th className="py-1 pr-3 text-right font-medium">tok/s</th>
              <th className="py-1 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {r.all.map((e) => (
              <tr key={e.quant} className={`border-t border-[var(--color-line)] ${e.quant === r.pick.quant ? "font-semibold" : ""}`}>
                <td className="py-1 pr-3">{e.quant}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {fmtGb(e.totalGb)} <span className="text-xs font-normal text-[var(--color-muted)]">({fmtGb(e.weightsGb)} + {fmtGb(e.kvGb)} KV)</span>
                </td>
                <td className="py-1 pr-3">{tierLabel(e)}</td>
                <td className="py-1 pr-3 text-right tabular-nums" style={{ color: e.verdict ? VERDICT_COLOR[e.verdict] : undefined }}>
                  {fmtTps(e.tps)}
                </td>
                <td className="py-1 text-xs font-normal text-[var(--color-muted)]">
                  {e.tier === "wont-fit" ? e.reason : <SpeedLabel e={e} calibrationSamples={calibrationSamples} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {m.ollamaTag ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-[var(--color-accent-soft)] px-2 py-1 font-mono text-xs">ollama run {m.ollamaTag}</code>
            <CopyButton text={`ollama run ${m.ollamaTag}`} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {m.hfRepo && (
            <a className="text-[var(--color-accent)] underline" href={`https://huggingface.co/${m.hfRepo}`} target="_blank" rel="noreferrer">
              Hugging Face
            </a>
          )}
          <a className="text-[var(--color-accent)] underline" href={`https://huggingface.co/models?library=gguf&search=${encodeURIComponent(m.name)}`} target="_blank" rel="noreferrer">
            GGUF files
          </a>
          {m.mlxRepo && (
            <a className="text-[var(--color-accent)] underline" href={`https://huggingface.co/${m.mlxRepo}`} target="_blank" rel="noreferrer">
              MLX
            </a>
          )}
          {!m.ollamaTag && (
            <a className="text-[var(--color-accent)] underline" href={`https://ollama.com/search?q=${encodeURIComponent(m.name)}`} target="_blank" rel="noreferrer">
              Search Ollama
            </a>
          )}
          <span className="text-[var(--color-muted)]">Licence: {m.license}</span>
        </div>
      </div>
    </div>
  );
}
