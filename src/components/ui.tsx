"use client";

import { useState, type ReactNode } from "react";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-[4px] border border-rule bg-sheet px-2.5 py-1.5 text-[15px] text-ink";

type Opt<T> = { value: T; label: string; disabled?: boolean };
type Group<T> = { group: string; options: Opt<T>[] };

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Opt<T>[] | Group<T>[];
  ariaLabel?: string;
  className?: string;
}) {
  const grouped = options.length > 0 && "group" in options[0];
  const parse = (raw: string) => (typeof value === "number" ? (Number(raw) as T) : (raw as T));
  const opt = (o: Opt<T>) => (
    <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
      {o.label}
    </option>
  );
  return (
    <select aria-label={ariaLabel} className={`${inputClass} ${className}`} value={String(value)} onChange={(e) => onChange(parse(e.target.value))}>
      {grouped
        ? (options as Group<T>[]).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map(opt)}
            </optgroup>
          ))
        : (options as Opt<T>[]).map(opt)}
    </select>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; ariaLabel?: string }) {
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      className={`${inputClass} tabular-nums`}
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

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Use-case toggle: plain text, underlined in board green when selected. */
export function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`border-b-2 pb-1 text-[15px] ${active ? "border-lead font-semibold text-lead" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-start gap-2 text-[15px]">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-lead)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Button({ children, onClick, variant = "primary", type = "button", disabled }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "quiet"; type?: "button" | "submit"; disabled?: boolean }) {
  const styles = {
    primary: "bg-action text-on-action hover:bg-action-hover",
    secondary: "border border-lead text-lead hover:bg-sheet",
    quiet: "text-lead underline underline-offset-2",
  }[variant];
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`rounded-[4px] px-3.5 py-1.5 text-[15px] font-medium disabled:opacity-50 ${styles}`}>
      {children}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-[4px] border border-rule px-2 py-0.5 text-sm text-muted hover:text-ink"
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
