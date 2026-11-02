"use client";

import type { Catalog, Gpu } from "@/lib/schema";
import { autoOsReserveGb, ramBandwidthGbs } from "@/lib/estimator";
import { RAM_DEFAULT_MTS, type Profile, type RamType } from "@/lib/profile";
import { Field, NumberInput, Segmented, Select } from "./ui";

const RAM_SIZES = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const VENDORS = [
  { value: "nvidia", label: "NVIDIA" },
  { value: "amd", label: "AMD" },
  { value: "intel", label: "Intel" },
] as const;

export function HardwareForm({
  profile,
  update,
  catalog,
  highlightCard,
}: {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
  catalog: Catalog;
  highlightCard: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={profile.mode}
        onChange={(mode) => update({ mode })}
        options={[
          { value: "pc", label: "PC with GPU" },
          { value: "unified", label: "Mac / unified memory" },
          { value: "cpu", label: "CPU only" },
        ]}
      />
      {profile.mode === "pc" && <GpuFields profile={profile} update={update} gpus={catalog.gpus} highlight={highlightCard} />}
      {profile.mode === "unified" && <UnifiedFields profile={profile} update={update} catalog={catalog} />}
      {profile.mode !== "unified" && <RamFields profile={profile} update={update} />}
    </div>
  );
}

function GpuFields({ profile, update, gpus, highlight }: { profile: Profile; update: (p: Partial<Profile>) => void; gpus: Gpu[]; highlight: boolean }) {
  const current = gpus.find((g) => g.id === profile.gpuId) ?? gpus[0];
  const vendor = current.vendor;
  const seriesList = [...new Set(gpus.filter((g) => g.vendor === vendor).map((g) => g.series))];
  const cards = gpus.filter((g) => g.vendor === vendor && g.series === current.series);
  const stockVram = current.vramGb.includes(profile.vramGb);
  const pick = (g: Gpu) => update({ gpuId: g.id, vramGb: g.vramGb[0] });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="GPU vendor">
        <Select
          value={vendor}
          onChange={(v) => pick(gpus.find((g) => g.vendor === v)!)}
          options={VENDORS.map((v) => ({ ...v }))}
        />
      </Field>
      <Field label="Series">
        <Select
          value={current.series}
          onChange={(s) => pick(gpus.find((g) => g.vendor === vendor && g.series === s)!)}
          options={seriesList.map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <Field label="Card">
        <Select
          highlight={highlight}
          value={current.id}
          onChange={(id) => pick(gpus.find((g) => g.id === id)!)}
          options={cards.map((g) => ({ value: g.id, label: g.name }))}
        />
      </Field>
      <Field label="VRAM" hint={`${current.bandwidthGbs} GB/s memory bandwidth${current.source === "estimated" ? " (unverified spec)" : ""}`}>
        <div className="flex gap-2">
          <Select
            ariaLabel="VRAM variant"
            value={stockVram ? profile.vramGb : -1}
            onChange={(v) => v > 0 && update({ vramGb: v })}
            options={[
              ...current.vramGb.map((v) => ({ value: v, label: `${v} GB` })),
              ...(stockVram ? [] : [{ value: -1, label: "Custom" }]),
            ]}
          />
          <div className="w-24 shrink-0">
            <NumberInput ariaLabel="VRAM override (GB)" value={profile.vramGb} min={1} max={512} onChange={(vramGb) => update({ vramGb })} />
          </div>
        </div>
      </Field>
      {!stockVram && (
        <p className="text-xs text-[var(--color-usable)] sm:col-span-2 lg:col-span-4">
          VRAM override: using {profile.vramGb} GB at the stock card&apos;s {current.bandwidthGbs} GB/s (modded / upgraded card).
        </p>
      )}
    </div>
  );
}

function UnifiedFields({ profile, update, catalog }: { profile: Profile; update: (p: Partial<Profile>) => void; catalog: Catalog }) {
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Family">
        <Select value={chip.family} onChange={(f) => pickChip(catalog.chips.find((c) => c.family === f)!.id)} options={families.map((f) => ({ value: f, label: f }))} />
      </Field>
      <Field label="Chip" hint={`${chip.bandwidthGbs} GB/s memory bandwidth`}>
        <Select value={chip.id} onChange={pickChip} options={chips.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label="Unified memory">
        <Select value={profile.memoryGb} onChange={(memoryGb) => update({ memoryGb })} options={chip.memoryOptionsGb.map((m) => ({ value: m, label: `${m} GB` }))} />
      </Field>
      <Field label="Kept for the OS (GB)" hint={`${Math.max(0, profile.memoryGb - reserve).toFixed(0)} GB usable for models${profile.osReserveGb == null ? " (auto)" : ""}`}>
        <NumberInput value={Math.round(reserve * 10) / 10} min={0} max={profile.memoryGb} onChange={(osReserveGb) => update({ osReserveGb })} />
      </Field>
    </div>
  );
}

function RamFields({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const bw = ramBandwidthGbs(profile.ramMts, profile.ramChannels);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="System RAM">
        <Select value={profile.ramGb} onChange={(ramGb) => update({ ramGb })} options={RAM_SIZES.map((r) => ({ value: r, label: `${r} GB` }))} />
      </Field>
      <Field label="RAM type">
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
      <Field label="Channels" hint={`≈ ${bw.toFixed(0)} GB/s system bandwidth`}>
        <Select
          value={profile.ramChannels}
          onChange={(ramChannels) => update({ ramChannels })}
          options={[
            { value: 1, label: "1 (single)" },
            { value: 2, label: "2 (dual, most desktops)" },
            { value: 4, label: "4 (HEDT / Strix Halo)" },
            { value: 8, label: "8 (workstation)" },
            { value: 12, label: "12 (server)" },
          ]}
        />
      </Field>
    </div>
  );
}
