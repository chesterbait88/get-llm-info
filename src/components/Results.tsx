"use client";

import { useState } from "react";
import type { ModelResult, QuantEstimate } from "@/lib/estimator";
import { fmtContext, fmtGb, fmtParams, fmtTps, tierLabel, VERDICT_COLOR, VERDICT_LABEL } from "@/lib/format";
import { CopyButton } from "./ui";

const USE_LABEL: Record<string, string> = {
  chat: "chat",
  coding: "coding",
  reasoning: "reasoning",
  vision: "images",
  "long-context": "long documents",
  agents: "agents and tools",
  edge: "small devices",
  writing: "writing",
};

export function Results({
  results,
  calibrated,
  requestedCtx,
  writerId,
  onWatch,
}: {
  results: ModelResult[];
  calibrated: boolean;
  requestedCtx: number;
  writerId: string | null;
  onWatch: (id: string) => void;
}) {
  if (!results.length) {
    return <p className="bg-sheet px-5 py-8 text-muted">No models match. Turn on the models that are too slow or won&apos;t fit, or pick another use case.</p>;
  }
  return (
    <ol className="divide-y divide-rule border-y border-rule bg-sheet">
      {results.map((r) => (
        <Row key={r.model.id} r={r} calibrated={calibrated} requestedCtx={requestedCtx} watching={writerId === r.model.id} onWatch={onWatch} />
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Speed ruler: log scale 1–300 tok/s with ticks at the verdict thresholds.
// ---------------------------------------------------------------------------
const MIN = 1;
const MAX = 300;
const pos = (tps: number) => (Math.log(Math.min(MAX, Math.max(MIN, tps))) / Math.log(MAX)) * 100;
const TICKS = [5, 10, 30];

export function Ruler({ e }: { e: QuantEstimate }) {
  if (e.tps == null) {
    return <div className="h-7" aria-hidden />;
  }
  const color = VERDICT_COLOR[e.verdict!];
  return (
    <div className="relative h-7 w-full" role="img" aria-label={`${fmtTps(e.tps)} tokens per second on a scale of 1 to 300`}>
      <div className="absolute left-0 right-0 top-3 h-px bg-rule" />
      {TICKS.map((t) => (
        <div key={t} className="absolute top-1.5 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pos(t)}%` }}>
          <div className="h-3 w-px bg-muted/50" />
          <span className="t-data mt-0.5 text-[10px] leading-none text-muted">{t}</span>
        </div>
      ))}
      {e.tpsLow != null && e.tpsHigh != null && (
        <div className="absolute top-[9px] h-[7px] rounded-[1px] opacity-25" style={{ left: `${pos(e.tpsLow)}%`, width: `${pos(e.tpsHigh) - pos(e.tpsLow)}%`, background: color }} />
      )}
      <div
        className={`absolute top-[8px] h-[9px] w-[9px] -translate-x-1/2 ${e.speedKind === "measured" ? "rotate-45" : "rounded-full"}`}
        style={{ left: `${pos(e.tps)}%`, background: color }}
      />
    </div>
  );
}

function SpeedSource({ e, calibrated }: { e: QuantEstimate; calibrated: boolean }) {
  if (e.tps == null) return null;
  if (e.speedKind === "measured" && e.benchmark) {
    return (
      <>
        Measured in{" "}
        <a className="underline decoration-dotted underline-offset-2" href={e.benchmark.sourceUrl} target="_blank" rel="noreferrer">
          {e.benchmark.sourceLabel}
        </a>
        {!e.benchmark.verified && <span title="Copied from the source, not yet re-checked"> (unchecked)</span>}
      </>
    );
  }
  if (e.speedKind === "derived") return <>A measured llama.cpp run, adjusted for this engine</>;
  return (
    <>
      Estimated {fmtTps(e.tpsLow)} to {fmtTps(e.tpsHigh)} tok/s
      {calibrated && ", tuned to measured runs on this chip"}
    </>
  );
}

function Row({ r, calibrated, requestedCtx, watching, onWatch }: { r: ModelResult; calibrated: boolean; requestedCtx: number; watching: boolean; onWatch: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { model: m, pick } = r;
  const fits = pick.tier !== "wont-fit";
  const color = pick.verdict ? VERDICT_COLOR[pick.verdict] : VERDICT_COLOR.nofit;
  const uses = m.useCases.map((u) => USE_LABEL[u] ?? u);

  return (
    <li className="border-l-4" style={{ borderLeftColor: color }}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_13rem_8rem] md:items-center">
        <div className="min-w-0">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-left">
            <span className="text-[17px] font-semibold">{m.name}</span>
            <span className="ml-2 text-[15px] text-muted">{m.lab}</span>
          </button>
          <p className="mt-0.5 text-[15px] text-muted">
            {fmtParams(m)} parameters, {fmtContext(m.contextNative)} context, {m.licenseClass === "permissive" ? m.license : `${m.license} licence`}. Good for {uses.join(", ")}.
          </p>
          <p className="mt-1 text-[15px]">
            {fits ? (
              <>
                {pick.quant}, {fmtGb(pick.totalGb)}. {tierLabel(pick)}.
                {pick.tier === "partial" && <span className="text-muted"> {fmtGb(pick.shortfallGb)} more VRAM would keep it all on the card.</span>}
                {pick.contextTokens < requestedCtx && <span className="text-muted"> Context limited to {fmtContext(pick.contextTokens)}.</span>}
              </>
            ) : (
              <>
                Needs about {fmtGb(pick.totalGb)} at {pick.quant}. That&apos;s {fmtGb(pick.shortfallGb)} more than you have free.
              </>
            )}
          </p>
        </div>

        <div className="hidden md:block">
          <Ruler e={pick} />
        </div>

        <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
          {fits ? (
            <>
              <div className="t-figure" style={{ color }}>
                {pick.speedKind === "estimated" ? "~" : ""}
                {fmtTps(pick.tps)}
                <span className="ml-1 text-sm font-medium">tok/s</span>
              </div>
              <div className="text-[15px] font-medium" style={{ color }}>
                {VERDICT_LABEL[pick.verdict!]}
              </div>
            </>
          ) : (
            <div className="text-[15px] font-medium text-nofit">Won&apos;t fit</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-3 text-sm text-muted sm:px-5">
        {fits && (
          <span>
            <SpeedSource e={pick} calibrated={calibrated} />
          </span>
        )}
        {fits && (
          <button type="button" className="font-medium text-board underline underline-offset-2 disabled:no-underline disabled:opacity-60" disabled={watching} onClick={() => onWatch(m.id)}>
            {watching ? "Shown in the preview" : "Preview its speed"}
          </button>
        )}
        <button type="button" className="font-medium text-board underline underline-offset-2" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide details" : "Every quantization and how to run it"}
        </button>
      </div>

      {open && <Details r={r} calibrated={calibrated} />}
    </li>
  );
}

function Details({ r, calibrated }: { r: ModelResult; calibrated: boolean }) {
  const m = r.model;
  return (
    <div className="border-t border-rule bg-paper/50 px-4 py-4 sm:px-5">
      {m.note && <p className="mb-2 max-w-[68ch] text-[15px]">{m.note}</p>}
      {m.archSource === "estimated" && (
        <p className="mb-3 max-w-[68ch] text-[15px] text-usable">This model&apos;s layer layout hasn&apos;t been checked against its config file yet, so memory for long contexts is approximate.</p>
      )}
      <div className="overflow-x-auto">
        <table className="t-data w-full min-w-[560px] text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1.5 pr-4 font-medium">Quantization</th>
              <th className="py-1.5 pr-4 font-medium">Memory (weights + context)</th>
              <th className="py-1.5 pr-4 font-medium">Where it runs</th>
              <th className="py-1.5 pr-4 text-right font-medium">tok/s</th>
              <th className="py-1.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {r.all.map((e) => (
              <tr key={e.quant} className={`border-t border-rule ${e.quant === r.pick.quant ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-4">
                  {e.quant}
                  {e.quant === r.pick.quant && <span className="ml-1.5 font-normal text-muted">(picked)</span>}
                </td>
                <td className="py-1.5 pr-4">
                  {fmtGb(e.totalGb)} <span className="font-normal text-muted">({fmtGb(e.weightsGb)} + {fmtGb(e.kvGb)})</span>
                </td>
                <td className="py-1.5 pr-4">{tierLabel(e)}</td>
                <td className="py-1.5 pr-4 text-right" style={{ color: e.verdict ? VERDICT_COLOR[e.verdict] : undefined }}>
                  {fmtTps(e.tps)}
                </td>
                <td className="py-1.5 font-normal text-muted">{e.tier === "wont-fit" ? e.reason : <SpeedSource e={e} calibrated={calibrated} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {m.ollamaTag && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-[4px] bg-board px-2.5 py-1 font-mono text-sm text-silk">ollama run {m.ollamaTag}</code>
            <CopyButton text={`ollama run ${m.ollamaTag}`} />
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
          {m.hfRepo && (
            <a className="text-board underline underline-offset-2" href={`https://huggingface.co/${m.hfRepo}`} target="_blank" rel="noreferrer">
              Model page on Hugging Face
            </a>
          )}
          <a className="text-board underline underline-offset-2" href={`https://huggingface.co/models?library=gguf&search=${encodeURIComponent(m.name)}`} target="_blank" rel="noreferrer">
            Find GGUF files
          </a>
          {m.mlxRepo && (
            <a className="text-board underline underline-offset-2" href={`https://huggingface.co/${m.mlxRepo}`} target="_blank" rel="noreferrer">
              MLX version for Mac
            </a>
          )}
          {!m.ollamaTag && (
            <a className="text-board underline underline-offset-2" href={`https://ollama.com/search?q=${encodeURIComponent(m.name)}`} target="_blank" rel="noreferrer">
              Search Ollama
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
