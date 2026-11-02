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
    if (profile.mode === "cpu") return setStatus({ ok: false, msg: "CPU-only submissions are not supported yet." });
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
      setStatus(res.ok ? { ok: true, msg: `Thanks! Submission #${body.id} is pending review.` } : { ok: false, msg: body.error ?? "Submission failed" });
    } catch {
      setStatus({ ok: false, msg: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 sm:p-5">
      <summary className="cursor-pointer font-semibold">
        Submit your own benchmark <span className="font-normal text-[var(--color-muted)]">· help turn estimates into measurements</span>
      </summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          Run <code className="font-mono">llama-bench -m model.gguf -p 512 -n 128</code> (or <code className="font-mono">ollama run MODEL --verbose</code>) and paste the output. Hardware: <strong>{hardwareName ?? "set above"}</strong>.
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
          <button type="submit" disabled={busy || tg <= 0} className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? "Submitting…" : "Submit"}
          </button>
          {status && <span className={`text-sm ${status.ok ? "text-[var(--color-instant)]" : "text-[var(--color-slow)]"}`}>{status.msg}</span>}
        </div>
      </form>
    </details>
  );
}
