"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelResult } from "@/lib/estimator";
import { fmtTps } from "@/lib/format";

/** Roughly 4 characters of English per token. */
const CHARS_PER_TOKEN = 4;
/** People read about 250 words a minute, ~5.5 tokens/sec. */
const READING_TPS = 5.5;

const SAMPLE =
  "Sure. Here's a plan for the weekend trip. Leave Friday after work so you miss the Saturday traffic, and book the cabin with the wood stove. " +
  "Pack layers, because the forecast drops below freezing at night. On Saturday, take the lake trail in the morning while it's quiet, then drive " +
  "into town for lunch at the bakery. Keep Sunday open: if it rains, there's a small museum, and if it's clear, the ridge loop has the best view in the valley. " +
  "Want me to turn this into a packing list?";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function Writer({ result, machine }: { result: ModelResult | null; machine: string }) {
  const tps = result?.pick.tps ?? null;
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!tps) return;
    if (reduced) {
      setShown(SAMPLE.length);
      return;
    }
    setShown(0);
    const start = performance.now();
    const charsPerMs = (tps * CHARS_PER_TOKEN) / 1000;
    const tick = (now: number) => {
      const n = Math.min(SAMPLE.length, Math.floor((now - start) * charsPerMs));
      setShown(n);
      if (n < SAMPLE.length) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [tps, reduced, run, result?.model.id]);

  if (!result || !tps) {
    return (
      <section className="border-l-4 border-nofit bg-sheet px-5 py-6">
        <p className="max-w-[60ch]">Nothing in the catalog runs at a usable speed on this setup. Add RAM or pick a larger graphics card above to see what opens up.</p>
      </section>
    );
  }

  const { model, pick } = result;
  const wpm = Math.round(tps * 60 * 0.75);
  const done = shown >= SAMPLE.length;
  const seconds = SAMPLE.length / CHARS_PER_TOKEN / tps;

  return (
    <section aria-label="Writing speed preview" className="grid grid-cols-1 gap-5 bg-sheet px-5 py-6 sm:px-7 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-muted">
          {model.name} on {machine}
        </p>
        <p className="t-figure text-lead">
          {pick.speedKind === "estimated" ? "~" : ""}
          {fmtTps(tps)}
          <span className="ml-1.5 text-base font-medium">tokens/sec</span>
        </p>
        <p className="text-[15px] text-muted">
          About {wpm.toLocaleString()} words a minute, {tps >= READING_TPS ? "faster than you read" : "slower than you read"}. This reply takes {seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds.
        </p>
        <div className="mt-1">
          <button type="button" className="text-[15px] font-medium text-lead underline underline-offset-2" onClick={() => setRun((r) => r + 1)}>
            {done ? "Play again" : "Restart"}
          </button>
        </div>
      </div>
      <p className="min-h-[9.5rem] max-w-[68ch] text-[17px] leading-7" aria-live="off">
        <span aria-hidden>{SAMPLE.slice(0, shown)}</span>
        <span className="writer-cursor" aria-hidden />
        <span className="sr-only">{SAMPLE}</span>
      </p>
    </section>
  );
}
