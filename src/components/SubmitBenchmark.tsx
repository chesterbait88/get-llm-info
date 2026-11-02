"use client";

import { useState } from "react";
import type { Catalog } from "@/lib/schema";
import type { Profile } from "@/lib/profile";
import { Field, NumberInput, Select, inputClass } from "./ui";

/** Self-reported benchmark form → POST /api/submissions (stored as pending). */
export function SubmitBenchmark({ catalog, profile }: { catalog: Catalog; profile: Profile }) {
  const [modelId, setModelId] = useState(catalog.models.find((m) => !m.legacy)?.id ?? catalog.models[0].id);
  const [quant, setQuant] = useState("Q4_K_M");
  const [engine, setEngine] = useState<string>(profile.engine);
  const [tg, setTg] = useState(0);
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const isChip = profile.mode === "unified";
  const hardwareId = isChip ? profile.chipId : profile.gpuId;
  const hardwareName = isChip ? catalog.chips.find((c) => c.id === hardwareId)?.name : catalog.gpus.find((g) => g.id === hardwareId)?.name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (profile.mode === "cpu") return setStatus({ ok: false, msg: "Benchmarks from machines without a graphics card can't be added yet." });
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hardwareId,
          hardwareKind: isChip ? "chip" : "gpu",
          vramGb: isChip ? null : profile.vramGb,
          ramGb: isChip ? profile.memoryGb : profile.ramGb,
          modelId,
          quant,
          engine,
          tgTps: tg,
          rawOutput: raw || null,
        }),
      });
      const body = await res.json();
      setStatus(res.ok ? { ok: true, msg: `Benchmark #${body.id} sent. It shows up once it's reviewed.` } : { ok: false, msg: body.error ?? "Submission failed" });
    } catch {
      setStatus({ ok: false, msg: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="border-t border-rule pt-4">
      <summary className="cursor-pointer text-[17px] font-semibold text-lead">
        Add your own benchmark{" "}
        <span className="font-normal text-muted">Measured runs replace estimates for everyone with the same hardware.</span>
      </summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          Run <code className="rounded-[3px] border border-rule bg-sheet px-1 font-mono text-[14px]">llama-bench -m model.gguf -p 512 -n 128</code> (or <code className="rounded-[3px] border border-rule bg-sheet px-1 font-mono text-[14px]">ollama run MODEL --verbose</code>) and paste the output. It will be filed under <strong>{hardwareName ?? "the hardware above"}</strong>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Model">
            <Select value={modelId} onChange={setModelId} options={catalog.models.map((m) => ({ value: m.id, label: m.name }))} />
          </Field>
          <Field label="Quant">
            <Select value={quant} onChange={setQuant} options={catalog.quants.map((q) => ({ value: q.id, label: q.label }))} />
          </Field>
          <Field label="Engine">
            <Select value={engine} onChange={setEngine} options={catalog.engines.map((x) => ({ value: x.id, label: x.name }))} />
          </Field>
          <Field label="Output speed (tg tok/s)">
            <NumberInput value={tg} min={0} step={0.1} onChange={setTg} />
          </Field>
        </div>
        <Field label="Raw output (optional, helps moderation)">
          <textarea className={`${inputClass} h-24 font-mono text-xs`} value={raw} onChange={(e) => setRaw(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy || tg <= 0} className="rounded-[4px] bg-action px-3.5 py-1.5 text-[15px] font-medium text-on-action hover:bg-action-hover disabled:opacity-50">
            {busy ? "Sending…" : "Send benchmark"}
          </button>
          {status && <span className={`text-sm ${status.ok ? "text-instant" : "text-slow"}`}>{status.msg}</span>}
        </div>
      </form>
    </details>
  );
}
