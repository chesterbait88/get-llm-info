"use client";

import { useEffect, useMemo, useState } from "react";
import type { Catalog, UseCase } from "@/lib/schema";
import { calibrationFor, engineSupported, evaluateModel, rankResults } from "@/lib/estimator";
import { probeBrowser, suggestFromProbe, type Probe, type Suggestion } from "@/lib/detect";
import { CONTEXT_STEPS, DEFAULT_PROFILE, fromQuery, toHardware, toQuery, toSettings, type Profile } from "@/lib/profile";
import { includeResults, SORT_KEYS, SORT_LABELS, sortResults } from "@/lib/sort";
import { fmtContext } from "@/lib/format";
import { HardwareForm } from "./HardwareForm";
import { Writer } from "./Writer";
import { Results } from "./Results";
import { Accuracy } from "./Accuracy";
import { SubmitBenchmark } from "./SubmitBenchmark";
import { ThemeSwitch } from "./ThemeSwitch";
import { Button, Check, Field, Segmented, Select, Tab } from "./ui";

const STORAGE_KEY = "llm-matcher-profile-v2";
const USE_CASES: { value: UseCase | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "chat", label: "Chat" },
  { value: "coding", label: "Coding" },
  { value: "reasoning", label: "Reasoning" },
  { value: "vision", label: "Images" },
  { value: "long-context", label: "Long documents" },
  { value: "agents", label: "Agents and tools" },
  { value: "edge", label: "Small and light" },
  { value: "writing", label: "Writing" },
];

function sanitize(p: Profile, cat: Catalog): Profile {
  const out = { ...p };
  if (!cat.gpus.some((g) => g.id === out.gpuId)) Object.assign(out, { gpuId: DEFAULT_PROFILE.gpuId, vramGb: DEFAULT_PROFILE.vramGb, vramCustom: false });
  if (!cat.chips.some((c) => c.id === out.chipId)) Object.assign(out, { chipId: DEFAULT_PROFILE.chipId, memoryGb: DEFAULT_PROFILE.memoryGb });
  if (out.cpuId !== "other" && !cat.cpus.some((c) => c.id === out.cpuId)) out.cpuId = DEFAULT_PROFILE.cpuId;
  return out;
}

export function Matcher({ catalog }: { catalog: Catalog }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [writerId, setWriterId] = useState<string | null>(null);
  const update = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  // Restore from the URL or this browser, then run the hardware probes silently.
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
      }
    });
  }, [catalog]);

  // Keep the URL shareable and remember the setup in this browser.
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

  const { all, calibration } = useMemo(() => {
    if (!hw) return { all: [], calibration: { factor: 1, samples: 0 } };
    const settings = toSettings(profile, engine);
    const cal = calibrationFor(hw, settings, catalog, llama);
    const results = catalog.models
      .filter((m) => profile.legacy || !m.legacy)
      .filter((m) => profile.use === "all" || m.useCases.includes(profile.use))
      .filter((m) => profile.license === "all" || m.licenseClass === "permissive")
      .map((m) => evaluateModel(m, hw, settings, catalog, cal.factor));
    return { all: results, calibration: cal };
  }, [hw, profile, engine, catalog, llama]);

  const shown = useMemo(() => sortResults(includeResults(all, profile), profile.sort, profile.dir), [all, profile]);
  const slowCount = all.filter((r) => r.pick.tier !== "wont-fit" && r.pick.verdict === "slow").length;
  const noFitCount = all.filter((r) => r.pick.tier === "wont-fit").length;
  const runnable = all.length - noFitCount;
  const best = rankResults(all).find((r) => r.pick.tier !== "wont-fit" && r.pick.verdict !== "slow") ?? null;
  const writerResult = all.find((r) => r.model.id === writerId && r.pick.tier !== "wont-fit") ?? best;
  const machineName = hw?.name ?? "your machine";
  const sortMeta = SORT_LABELS[profile.sort];

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-12 px-4 pb-16 pt-8 sm:pt-14">
      <header className="flex flex-col-reverse gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="t-title text-lead">Which open models will your machine run, and how fast?</h1>
          <p className="max-w-[60ch] text-[17px] text-muted">
            Fill in your parts. Every model is checked for fit and given the best quantization it can use, plus how many tokens a second it will write.
          </p>
        </div>
        <ThemeSwitch />
      </header>

      <div className="flex flex-col gap-4">
        {showConfirm && suggestion && (
          <ConfirmCard
            suggestion={suggestion}
            probe={probe}
            profile={profile}
            update={update}
            catalog={catalog}
            onDone={() => setShowConfirm(false)}
          />
        )}
        <HardwareForm profile={profile} update={update} catalog={catalog} detectedThreads={probe?.threads ?? null} />
      </div>

      <section aria-labelledby="preview-title" className="flex flex-col gap-3">
        <h2 id="preview-title" className="t-heading text-lead">
          {writerResult && writerResult !== best ? "Speed preview" : "Your best match, writing at its real speed"}
        </h2>
        <Writer result={writerResult} machine={machineName} />
      </section>

      <section aria-labelledby="results-title" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="results-title" className="t-heading text-lead">
            Models for your machine
          </h2>
          <p className="max-w-[68ch] text-[15px] text-muted">
            {runnable} of {all.length} run on {machineName}.{" "}
            {calibration.samples > 0 && `Estimates here are tuned to ${calibration.samples} measured run${calibration.samples > 1 ? "s" : ""} on this chip. `}
            A circle on the ruler is an estimate with its likely range, a diamond is a measured result. The ticks mark 5, 10 and 30 tokens a second.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Use case">
          {USE_CASES.map((u) => (
            <Tab key={u.value} active={profile.use === u.value} onClick={() => update({ use: u.value })}>
              {u.label}
            </Tab>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_auto_minmax(0,1fr)] md:items-end">
          <Field label="Sort by">
            <Select value={profile.sort} onChange={(sort) => update({ sort, dir: SORT_LABELS[sort].natural })} options={SORT_KEYS.map((k) => ({ value: k, label: SORT_LABELS[k].label }))} />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="field-label">Order</span>
            <Segmented
              ariaLabel="Sort order"
              value={profile.dir}
              onChange={(dir) => update({ dir })}
              options={[
                { value: "desc", label: sortMeta.desc },
                { value: "asc", label: sortMeta.asc },
              ]}
            />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="field-label mb-1">Also show</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <Check checked={profile.showSlow} onChange={(showSlow) => update({ showSlow })}>
                Too slow, under 5 tok/s ({slowCount})
              </Check>
              <Check checked={profile.showNoFit} onChange={(showNoFit) => update({ showNoFit })}>
                Won&apos;t fit ({noFitCount})
              </Check>
            </div>
          </fieldset>
        </div>

        <details className="group border-y border-rule py-3">
          <summary className="cursor-pointer text-[15px] font-medium text-lead">
            Engine, context and quality settings
            <span className="ml-2 font-normal text-muted">
              {engine.name}, {fmtContext(profile.ctx)} context, {profile.pref === "balanced" ? "balanced quality" : profile.pref === "speed" ? "fastest quantization" : "best quality"}
            </span>
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Engine" hint={engine.notes.split(". ")[0] + "."}>
              <Select value={engine.id} onChange={(id) => update({ engine: id })} options={availableEngines.map((e) => ({ value: e.id, label: e.name }))} />
            </Field>
            <Field label="Context window" hint="Memory for the whole window is reserved up front.">
              <Select value={profile.ctx} onChange={(ctx) => update({ ctx })} options={CONTEXT_STEPS.map((c) => ({ value: c, label: `${fmtContext(c)} tokens` }))} />
            </Field>
            <Field label="Context memory precision" hint="Lower precision fits longer contexts.">
              <Select
                value={profile.kv}
                onChange={(kv) => update({ kv })}
                options={[
                  { value: "f16", label: "Full (F16)" },
                  { value: "q8", label: "Half (Q8)" },
                  { value: "q4", label: "Quarter (Q4)" },
                ]}
              />
            </Field>
            <div className="flex flex-col gap-1">
              <span className="field-label">Quantization to pick</span>
              <Segmented
                ariaLabel="Quantization preference"
                value={profile.pref}
                onChange={(pref) => update({ pref })}
                options={[
                  { value: "speed", label: "Fastest" },
                  { value: "balanced", label: "Balanced" },
                  { value: "quality", label: "Best quality" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="field-label">Licence</span>
              <Segmented
                ariaLabel="Licence"
                value={profile.license}
                onChange={(license) => update({ license })}
                options={[
                  { value: "all", label: "Any" },
                  { value: "permissive", label: "OK for commercial use" },
                ]}
              />
            </div>
            <div className="flex items-end">
              <Check checked={profile.legacy} onChange={(legacy) => update({ legacy })}>
                Include older reference models
              </Check>
            </div>
          </div>
        </details>

        <Results results={shown} calibrated={calibration.samples > 0} requestedCtx={profile.ctx} writerId={writerResult?.model.id ?? null} onWatch={(id) => {
          setWriterId(id);
          document.getElementById("preview-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} />
      </section>

      <section className="flex flex-col gap-4">
        <Accuracy catalog={catalog} />
        <SubmitBenchmark catalog={catalog} profile={profile} />
      </section>

      <footer className="max-w-[68ch] text-sm text-muted">
        <p>
          How the numbers work: writing speed is limited by memory bandwidth, because every token reads the model&apos;s active weights once. So tokens a second is
          roughly bandwidth times efficiency, divided by the bytes read per token, plus a small cost per layer that matters for mixture-of-experts models. Memory
          needed is the weights, plus the context, plus about 1 GB for the runtime. Measured results replace estimates wherever we have them.
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
  onDone,
}: {
  suggestion: Suggestion;
  probe: Probe | null;
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  catalog: Catalog;
  onDone: () => void;
}) {
  const chip = catalog.chips.find((c) => c.id === profile.chipId);
  return (
    <div className="border-l-4 border-gold bg-sheet px-5 py-4">
      {suggestion.confidence === "none" ? (
        <p>Your browser didn&apos;t say which graphics card you have. Pick your parts on the board below.</p>
      ) : (
        <p className="text-[17px]">
          Your browser says this is <strong>{suggestion.summary}</strong>. Check the processor and RAM below; browsers can&apos;t see those.
        </p>
      )}
      {suggestion.alternatives.length > 0 && (
        <p className="mt-2 text-[15px]">
          Same name, different version:{" "}
          {suggestion.alternatives.map((a) => (
            <button key={a.id} type="button" className="font-medium text-lead underline underline-offset-2" onClick={() => update({ chipId: a.id })}>
              {a.name}
            </button>
          ))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {profile.mode === "unified" && chip ? (
          <div className="w-32">
            <Field label="Memory">
              <Select value={profile.memoryGb} onChange={(memoryGb) => update({ memoryGb })} options={chip.memoryOptionsGb.map((m) => ({ value: m, label: `${m} GB` }))} />
            </Field>
          </div>
        ) : (
          <div className="w-40">
            <Field label="RAM" hint={probe?.deviceMemoryGb ? `Browser shows at least ${probe.deviceMemoryGb} GB` : undefined}>
              <Select value={profile.ramGb} onChange={(ramGb) => update({ ramGb })} options={[8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((r) => ({ value: r, label: `${r} GB` }))} />
            </Field>
          </div>
        )}
        <Button onClick={onDone}>That&apos;s right</Button>
      </div>
    </div>
  );
}
