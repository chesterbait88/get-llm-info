"use client";

import type { ReactNode } from "react";
import type { Catalog, Cpu, Gpu } from "@/lib/schema";
import { autoOsReserveGb, ramBandwidthGbs } from "@/lib/estimator";
import { cpuDefaults, OTHER_CPU, RAM_DEFAULT_MTS, type Profile, type RamType } from "@/lib/profile";
import { Field, NumberInput, Segmented, Select } from "./ui";

const RAM_SIZES = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];
type Update = (patch: Partial<Profile>) => void;

/** The spec board: one silkscreened slot per part, filled in CPU, GPU, RAM order. */
export function HardwareForm({ profile, update, catalog, detectedThreads }: { profile: Profile; update: Update; catalog: Catalog; detectedThreads: number | null }) {
  return (
    <section aria-labelledby="board-title" className="board relative rounded-[14px] bg-board px-4 pb-5 pt-5 text-silk sm:px-7 sm:pb-7">
      <div aria-hidden className="pointer-events-none absolute inset-[6px] rounded-[9px] border border-silk/20" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="board-title" className="t-heading">
          Your machine
        </h2>
        <Segmented
          ariaLabel="Kind of machine"
          value={profile.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: "pc", label: "PC with a graphics card" },
            { value: "unified", label: "Mac or unified memory" },
            { value: "cpu", label: "No graphics card" },
          ]}
        />
      </div>

      <div className="relative mt-5 flex flex-col">
        {profile.mode === "unified" ? (
          <Slot designator="SoC" note="Processor, graphics and memory share one chip, so the memory you pick here is what models load into.">
            <UnifiedFields profile={profile} update={update} catalog={catalog} />
          </Slot>
        ) : (
          <>
            <Slot designator="CPU">
              <CpuFields profile={profile} update={update} cpus={catalog.cpus} detectedThreads={detectedThreads} />
            </Slot>
            {profile.mode === "pc" && (
              <Slot designator="GPU">
                <GpuFields profile={profile} update={update} gpus={catalog.gpus} />
              </Slot>
            )}
            <Slot designator="RAM">
              <RamFields profile={profile} update={update} />
            </Slot>
          </>
        )}
      </div>
    </section>
  );
}

function Slot({ designator, children, note }: { designator: string; children: ReactNode; note?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-silk/15 py-5 first:border-t-0 first:pt-1 last:pb-0 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-6">
      <div className="pt-0.5">
        <span className="silk-label">{designator}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {note && <p className="max-w-[60ch] text-[15px] text-silk-dim">{note}</p>}
        {children}
      </div>
    </div>
  );
}

const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

function CpuFields({ profile, update, cpus, detectedThreads }: { profile: Profile; update: Update; cpus: Cpu[]; detectedThreads: number | null }) {
  const current = cpus.find((c) => c.id === profile.cpuId);
  const vendor = current?.vendor ?? (profile.cpuId === OTHER_CPU ? "other" : "amd");
  const series = current?.series ?? "";
  const pick = (c: Cpu) => update(cpuDefaults(c));
  const seriesList = [...new Set(cpus.filter((c) => c.vendor === vendor).map((c) => c.series))];
  const models = cpus.filter((c) => c.vendor === vendor && c.series === series);

  let hint: string;
  if (current) {
    hint = `${current.cores} cores, ${current.threads} threads, ${current.memoryChannels}-channel ${current.ramTypes.map((t) => t.toUpperCase()).join("/")}${current.avx512 ? ", AVX-512" : ""}`;
  } else {
    hint = "Physical cores matter when part of a model runs on the CPU.";
  }

  return (
    <>
      <div className={grid}>
        <Field label="Brand">
          <Select
            value={vendor}
            onChange={(v) => (v === "other" ? update({ cpuId: OTHER_CPU }) : pick(cpus.find((c) => c.vendor === v)!))}
            options={[
              { value: "amd", label: "AMD" },
              { value: "intel", label: "Intel" },
              { value: "other", label: "Not listed" },
            ]}
          />
        </Field>
        {current ? (
          <>
            <Field label="Family">
              <Select value={series} onChange={(s) => pick(cpus.find((c) => c.vendor === vendor && c.series === s)!)} options={seriesList.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Processor" className="lg:col-span-2">
              <Select value={current.id} onChange={(id) => pick(cpus.find((c) => c.id === id)!)} options={models.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          </>
        ) : (
          <Field label="Physical cores">
            <NumberInput value={profile.cpuCores} min={1} max={256} onChange={(cpuCores) => update({ cpuCores })} />
          </Field>
        )}
      </div>
      <p className="field-hint">
        {hint}
        {detectedThreads ? `. Your browser reports ${detectedThreads} threads; it can't see the model name.` : "."}
      </p>
    </>
  );
}

function GpuFields({ profile, update, gpus }: { profile: Profile; update: Update; gpus: Gpu[] }) {
  const current = gpus.find((g) => g.id === profile.gpuId) ?? gpus[0];
  const vendor = current.vendor;
  const seriesList = [...new Set(gpus.filter((g) => g.vendor === vendor).map((g) => g.series))];
  const cards = gpus.filter((g) => g.vendor === vendor && g.series === current.series);
  const pick = (g: Gpu) => update({ gpuId: g.id, vramGb: g.vramGb[0], vramCustom: false });
  const stockVram = current.vramGb.includes(profile.vramGb) ? profile.vramGb : current.vramGb[0];

  return (
    <>
      <div className={grid}>
        <Field label="Brand">
          <Select
            value={vendor}
            onChange={(v) => pick(gpus.find((g) => g.vendor === v)!)}
            options={[
              { value: "nvidia", label: "NVIDIA" },
              { value: "amd", label: "AMD" },
              { value: "intel", label: "Intel" },
            ]}
          />
        </Field>
        <Field label="Series">
          <Select value={current.series} onChange={(s) => pick(gpus.find((g) => g.vendor === vendor && g.series === s)!)} options={seriesList.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Card">
          <Select value={current.id} onChange={(id) => pick(gpus.find((g) => g.id === id)!)} options={cards.map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="Video memory (VRAM)" hint={`${current.bandwidthGbs} GB/s bandwidth${current.source === "estimated" ? ", spec not yet verified" : ""}`}>
          {profile.vramCustom ? (
            <span className="py-1.5 text-[15px]">
              {profile.vramGb} GB <span className="text-silk-dim">(override, stock is {current.vramGb.join(" or ")} GB)</span>
            </span>
          ) : current.vramGb.length > 1 ? (
            <Select value={stockVram} onChange={(vramGb) => update({ vramGb, vramCustom: false })} options={current.vramGb.map((v) => ({ value: v, label: `${v} GB` }))} />
          ) : (
            <span className="py-1.5 text-[15px]">{current.vramGb[0]} GB</span>
          )}
        </Field>
      </div>

      <div className="mt-1 rounded-[4px] border border-silk/20 p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--color-gold)]"
            checked={profile.vramCustom}
            onChange={(e) => update({ vramCustom: e.target.checked, vramGb: e.target.checked ? profile.vramGb : stockVram })}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">VRAM override</span>
            <span className="max-w-[68ch] text-[15px] text-silk-dim">
              Some cards are modded or upgraded with more memory than they shipped with, like a 48 GB RTX 4090 or a 22 GB RTX 2080 Ti. Turn this on to enter
              the real amount. Speed still uses the stock card&apos;s bandwidth.
            </span>
          </span>
        </label>
        {profile.vramCustom && (
          <div className="mt-3 max-w-[14rem] pl-6">
            <Field label="Actual VRAM (GB)">
              <NumberInput value={profile.vramGb} min={1} max={512} onChange={(vramGb) => update({ vramGb })} />
            </Field>
          </div>
        )}
      </div>
    </>
  );
}

function UnifiedFields({ profile, update, catalog }: { profile: Profile; update: Update; catalog: Catalog }) {
  const chip = catalog.chips.find((c) => c.id === profile.chipId) ?? catalog.chips[0];
  const families = [...new Set(catalog.chips.map((c) => c.family))];
  const chips = catalog.chips.filter((c) => c.family === chip.family);
  const pickChip = (id: string) => {
    const c = catalog.chips.find((x) => x.id === id)!;
    const memoryGb = c.memoryOptionsGb.includes(profile.memoryGb) ? profile.memoryGb : c.memoryOptionsGb[Math.min(1, c.memoryOptionsGb.length - 1)];
    update({ chipId: c.id, memoryGb });
  };
  const reserve = profile.osReserveGb ?? autoOsReserveGb(profile.memoryGb);

  return (
    <div className={grid}>
      <Field label="Family">
        <Select value={chip.family} onChange={(f) => pickChip(catalog.chips.find((c) => c.family === f)!.id)} options={families.map((f) => ({ value: f, label: f }))} />
      </Field>
      <Field label="Chip" hint={`${chip.bandwidthGbs} GB/s bandwidth`}>
        <Select value={chip.id} onChange={pickChip} options={chips.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label="Memory">
        <Select value={profile.memoryGb} onChange={(memoryGb) => update({ memoryGb })} options={chip.memoryOptionsGb.map((m) => ({ value: m, label: `${m} GB` }))} />
      </Field>
      <Field label="Kept free for the system (GB)" hint={`${Math.max(0, profile.memoryGb - reserve).toFixed(0)} GB left for models${profile.osReserveGb == null ? ", set automatically" : ""}`}>
        <NumberInput value={Math.round(reserve * 10) / 10} min={0} max={profile.memoryGb} onChange={(osReserveGb) => update({ osReserveGb })} />
      </Field>
    </div>
  );
}

function RamFields({ profile, update }: { profile: Profile; update: Update }) {
  const bw = ramBandwidthGbs(profile.ramMts, profile.ramChannels);
  return (
    <>
      <div className={grid}>
        <Field label="Amount">
          <Select value={profile.ramGb} onChange={(ramGb) => update({ ramGb })} options={RAM_SIZES.map((r) => ({ value: r, label: `${r} GB` }))} />
        </Field>
        <Field label="Type">
          <Select
            value={profile.ramType}
            onChange={(ramType: RamType) => update({ ramType, ramMts: RAM_DEFAULT_MTS[ramType] })}
            options={[
              { value: "ddr4", label: "DDR4" },
              { value: "ddr5", label: "DDR5" },
              { value: "lpddr5x", label: "LPDDR5X" },
            ]}
          />
        </Field>
        <Field label="Speed (MT/s)">
          <NumberInput value={profile.ramMts} min={1600} max={12000} step={100} onChange={(ramMts) => update({ ramMts })} />
        </Field>
        <Field label="Channels">
          <Select
            value={profile.ramChannels}
            onChange={(ramChannels) => update({ ramChannels })}
            options={[1, 2, 4, 8, 12].map((c) => ({ value: c, label: c === 1 ? "1 (single)" : c === 2 ? "2 (dual)" : String(c) }))}
          />
        </Field>
      </div>
      <p className="field-hint">
        About {bw.toFixed(0)} GB/s. Browsers can&apos;t read your RAM, so check the amount. Most desktops and laptops run two channels.
      </p>
    </>
  );
}
