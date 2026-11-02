"use client";

import { useState, type ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--color-muted)]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]";

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  highlight,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[] | { group: string; options: { value: T; label: string }[] }[];
  highlight?: boolean;
  ariaLabel?: string;
}) {
  const isGrouped = options.length > 0 && "group" in options[0];
  const parse = (raw: string) => (typeof value === "number" ? (Number(raw) as T) : (raw as T));
  return (
    <select
      aria-label={ariaLabel}
      className={`${inputCls} ${highlight ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent-soft)]" : ""}`}
      value={String(value)}
      onChange={(e) => onChange(parse(e.target.value))}
    >
      {isGrouped
        ? (options as { group: string; options: { value: T; label: string }[] }[]).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))
        : (options as { value: T; label: string; disabled?: boolean }[]).map((o) => (
            <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
    </select>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; ariaLabel?: string }) {
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      className={inputCls}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n) && e.target.value !== "") onChange(n);
      }}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-[var(--color-line)] p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === o.value ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--color-muted)]">
      {children}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export const inputClass = inputCls;
