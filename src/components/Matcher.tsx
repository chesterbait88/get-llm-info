"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, UseCase } from "@/lib/schema";
import { calibrationFor, engineSupported, evaluateModel, rankResults, type ModelResult } from "@/lib/estimator";
import { probeBrowser, suggestFromProbe, type Probe, type Suggestion } from "@/lib/detect";
import { CONTEXT_STEPS, DEFAULT_PROFILE, fromQuery, toHardware, toQuery, toSettings, type Profile } from "@/lib/profile";
import { fmtContext, fmtTps } from "@/lib/format";
import { HardwareForm } from "./HardwareForm";
import { Results } from "./Results";
import { Accuracy } from "./Accuracy";
import { SubmitBenchmark } from "./SubmitBenchmark";
import { Chip, Field, Panel, Segmented, Select } from "./ui";

const STORAGE_KEY = "llm-matcher-profile-v1";
const USE_CASES: { value: UseCase | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "coding", label: "Coding" },
  { value: "reasoning", label: "Reasoning" },
  { value: "vision", label: "Vision" },
  { value: "long-context", label: "Long context / RAG" },
  { value: "agents", label: "Agents / tools" },
  { value: "edge", label: "Small / edge" },
  { value: "writing", label: "Writing" },
];
type Sort = "recommended" | "speed" | "size" | "newest";

function sanitize(p: Profile, cat: Catalog): Profile {
  const out = { ...p };
  if (!cat.gpus.some((g) => g.id === out.gpuId)) Object.assign(out, { gpuId: DEFAULT_PROFILE.gpuId, vramGb: DEFAULT_PROFILE.vramGb });
  if (!cat.chips.some((c) => c.id === out.chipId)) Object.assign(out, { chipId: DEFAULT_PROFILE.chipId, memoryGb: DEFAULT_PROFILE.memoryGb });
  return out;
}

export function Matcher({ catalog }: { catalog: Catalog }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sort, setSort] = useState<Sort>("recommended");
  const [showNoFit, setShowNoFit] = useState(false);
  const hardwareRef = useRef<HTMLDivElement>(null);
  const update = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  // 1. Restore from URL or localStorage, 2. run the browser probes silently.
  useEffect(() => {
    let saved: Profile | null = null;
    if (window.location.search.includes("mode=")) saved = fromQuery(window.location.search);
    else {
      try {
        const s = window.localStorage.getItem(STORAGE_KEY);
        if (s) saved = fromQuery(s);
      } catch {
        /* storage blocked */
      }
    }
    if (saved) setProfile(sanitize(saved, catalog));
    setReady(true);
    probeBrowser().then((p) => {
      const s = suggestFromProbe(p, catalog);
      setProbe(p);
      setSuggestion(s);
      if (!saved) {
        setProfile((prev) => sanitize({ ...prev, ...s.patch }, catalog));
        setShowConfirm(true);
      } else if (p.threads) {
        setProfile((prev) => ({ ...prev, cpuThreads: p.threads }));
      }
    });
  }, [catalog]);

  // Keep the URL shareable and remember the profile.
  useEffect(() => {
    if (!ready) return;
    const q = toQuery(profile);
    window.history.replaceState(null, "", `?${q}`);
    try {
      window.localStorage.setItem(STORAGE_KEY, q);
    } catch {
      /* storage blocked */
    }
  }, [profile, ready]);

  const hw = useMemo(() => toHardware(profile, catalog), [profile, catalog]);
  const llama = catalog.engines.find((e) => e.id === "llamacpp")!;
  const availableEngines = hw ? catalog.engines.filter((e) => engineSupported(e, hw)) : [llama];
  const engine = availableEngines.find((e) => e.id === profile.engine) ?? llama;

  const { runnable, noFit, calibration } = useMemo(() => {
    if (!hw) return { runnable: [] as ModelResult[], noFit: [] as ModelResult[], calibration: { factor: 1, samples: 0 } };
    const settings = toSettings(profile, engine);
    const cal = calibrationFor(hw, settings, catalog, llama);
    const results = catalog.models
      .filter((m) => profile.legacy || !m.legacy)
      .filter((m) => profile.use === "all" || m.useCases.includes(profile.use))
      .filter((m) => profile.license === "all" || m.licenseClass === "permissive")
      .map((m) => evaluateModel(m, hw, settings, catalog, cal.factor));
    let ranked = rankResults(results);
    const fits = (r: ModelResult) => r.pick.tier !== "wont-fit";
    if (sort === "speed") ranked = [...ranked].sort((a, b) => (b.pick.tps ?? -1) - (a.pick.tps ?? -1));
    if (sort === "size") ranked = [...ranked].sort((a, b) => b.model.totalParamsB - a.model.totalParamsB);
    if (sort === "newest") ranked = [...ranked].sort((a, b) => (b.model.releaseDate ?? "").localeCompare(a.model.releaseDate ?? ""));
    return { runnable: ranked.filter(fits), noFit: ranked.filter((r) => !fits(r)), calibration: cal };
  }, [hw, profile, engine, catalog, llama, sort]);

  const comfy = runnable.filter((r) => r.pick.verdict && r.pick.verdict !== "slow" && r.pick.verdict !== "usable");
  const best = runnable.find((r) => r.pick.verdict !== "slow");

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">Which open models can my machine run?</h1>
        <p className="text-[var(--color-muted)]">Ranked local LLMs for your hardware, with the best quantization that fits and how fast each one writes.</p>
      </header>

      {showConfirm && suggestion && (
        <ConfirmCard
          suggestion={suggestion}
          probe={probe}
          profile={profile}
          update={update}
          catalog={catalog}
          onConfirm={() => setShowConfirm(false)}
          onEdit={() => {
            setShowConfirm(false);
            hardwareRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      )}

      <div ref={hardwareRef}>
        <Panel>
          <h2 className="mb-3 font-semibold">Your hardware</h2>
          <HardwareForm profile={profile} update={update} catalog={catalog} highlightCard={suggestion?.confidence === "family" && profile.mode === "pc"} />
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {USE_CASES.map((u) => (
              <Chip key={u.value} active={profile.use === u.value} onClick={() => update({ use: u.value })}>
                {u.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Engine" hint={engine.notes.split(".")[0] + "."}>
              <Select value={engine.id} onChange={(id) => update({ engine: id })} options={availableEngines.map((e) => ({ value: e.id, label: e.name }))} />
            </Field>
            <Field label="Context window" hint="KV cache is reserved for the full window">
              <Select value={profile.ctx} onChange={(ctx) => update({ ctx })} options={CONTEXT_STEPS.map((c) => ({ value: c, label: `${fmtContext(c)} tokens` }))} />
            </Field>
            <Field label="KV cache precision">
              <Select
                value={profile.kv}
                onChange={(kv) => update({ kv })}
                options={[
                  { value: "f16", label: "F16 (default)" },
                  { value: "q8", label: "Q8_0 (half the memory)" },
                  { value: "q4", label: "Q4_0 (quarter)" },
                ]}
              />
            </Field>
            <Field label="Sort">
              <Select
                value={sort}
                onChange={setSort}
                options={[
                  { value: "recommended", label: "Recommended" },
                  { value: "speed", label: "Fastest" },
                  { value: "size", label: "Largest" },
                  { value: "newest", label: "Newest" },
                ]}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted)]">Quant</span>
              <Segmented
                value={profile.pref}
                onChange={(pref) => update({ pref })}
                options={[
                  { value: "speed", label: "Fastest" },
                  { value: "balanced", label: "Balanced" },
                  { value: "quality", label: "Best quality" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted)]">Licence</span>
              <Segmented
                value={profile.license}
                onChange={(license) => update({ license })}
                options={[
                  { value: "all", label: "Any" },
                  { value: "permissive", label: "Permissive only" },
                ]}
              />
            </div>
            <label className="flex items-center gap-2 text-[var(--color-muted)]">
              <input type="checkbox" checked={profile.legacy} onChange={(e) => update({ legacy: e.target.checked })} />
              Show older / reference models
            </label>
          </div>
        </div>
      </Panel>

      {hw && (
        <p className="text-sm text-[var(--color-muted)]">
          <strong className="text-[var(--color-ink)]">{runnable.length}</strong> models run on {hw.name}
          {comfy.length > 0 && (
            <>
              , <strong className="text-[var(--color-ink)]">{comfy.length}</strong> at 10+ tok/s
            </>
          )}
          {best && (
            <>
              . Most capable at a usable speed: <strong className="text-[var(--color-ink)]">{best.model.name}</strong> ({best.pick.quant}, ~{fmtTps(best.pick.tps)} tok/s)
            </>
          )}
          {calibration.samples > 0 && <> · estimates calibrated from {calibration.samples} measured run{calibration.samples > 1 ? "s" : ""} on this device</>}.
        </p>
      )}

      <Results results={runnable} calibrationSamples={calibration.samples} requestedCtx={profile.ctx} />

      {noFit.length > 0 && (
        <div>
          <button type="button" className="text-sm text-[var(--color-accent)] underline" onClick={() => setShowNoFit(!showNoFit)}>
            {showNoFit ? "Hide" : "Show"} {noFit.length} model{noFit.length > 1 ? "s" : ""} that won&apos;t fit
          </button>
          {showNoFit && (
            <div className="mt-2">
              <Results results={noFit} calibrationSamples={0} requestedCtx={profile.ctx} />
            </div>
          )}
        </div>
      )}

      <Accuracy catalog={catalog} />
      <SubmitBenchmark catalog={catalog} profile={profile} />

      <footer className="pt-4 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          <strong>How it works.</strong> Output speed is limited by memory bandwidth: each token reads the model&apos;s active weights once, so tok/s ≈ bandwidth × efficiency ÷ bytes per token, plus a small per-layer overhead that matters for
          mixture-of-experts models. Memory needed = weights + KV cache + ~1 GB runtime. Measured numbers replace estimates wherever we have them. Verdicts: &gt;30 tok/s instant, 10–30 comfortable, 5–10 usable, &lt;5 slow.
        </p>
      </footer>
    </main>
  );
}

function ConfirmCard({
  suggestion,
  probe,
  profile,
  update,
  catalog,
  onConfirm,
  onEdit,
}: {
  suggestion: Suggestion;
  probe: Probe | null;
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  catalog: Catalog;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const chip = catalog.chips.find((c) => c.id === profile.chipId);
  return (
    <div className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
      {suggestion.confidence === "none" ? (
        <p>We couldn&apos;t detect your GPU from the browser. Pick your hardware below.</p>
      ) : (
        <p>
          We think you have <strong>{suggestion.summary}</strong>
          {probe?.threads ? ` and a ${probe.threads}-thread CPU` : ""}. Correct?
        </p>
      )}
      {suggestion.alternatives.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>Or is it:</span>
          {suggestion.alternatives.map((a) => (
            <button key={a.id} type="button" className="underline" onClick={() => update({ chipId: a.id })}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        {profile.mode === "unified" && chip ? (
          <label className="flex items-center gap-2">
            Memory:
            <span className="w-28">
              <Select value={profile.memoryGb} onChange={(memoryGb) => update({ memoryGb })} options={chip.memoryOptionsGb.map((m) => ({ value: m, label: `${m} GB` }))} />
            </span>
          </label>
        ) : (
          <label className="flex items-center gap-2">
            Browsers can&apos;t see your RAM{probe?.deviceMemoryGb ? ` (it reports “${probe.deviceMemoryGb}+ GB”)` : ""}. How much?
            <span className="w-28">
              <Select value={profile.ramGb} onChange={(ramGb) => update({ ramGb })} options={[8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((r) => ({ value: r, label: `${r} GB` }))} />
            </span>
          </label>
        )}
        <button type="button" className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-white" onClick={onConfirm}>
          Looks right
        </button>
        <button type="button" className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-[var(--color-accent)]" onClick={onEdit}>
          Edit hardware
        </button>
      </div>
    </div>
  );
}
