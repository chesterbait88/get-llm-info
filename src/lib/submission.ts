/** Validation + automatic trust checks for self-reported benchmark runs. */
import { z } from "zod";
import { EngineSchema, QuantId, type Catalog } from "./schema";
import { weightsGb } from "./estimator";

export const SubmissionInput = z.object({
  hardwareId: z.string().min(1).max(80),
  hardwareKind: z.enum(["gpu", "chip"]),
  vramGb: z.number().positive().max(2048).nullish(),
  ramGb: z.number().positive().max(4096).nullish(),
  modelId: z.string().min(1).max(80),
  quant: QuantId,
  engine: EngineSchema.shape.id,
  engineVersion: z.string().max(80).nullish(),
  contextDepth: z.number().int().min(0).max(10_000_000).default(0),
  tgTps: z.number().positive().max(100_000),
  ppTps: z.number().positive().max(1_000_000).nullish(),
  rawOutput: z.string().max(20_000).nullish(),
  notes: z.string().max(2_000).nullish(),
});
export type SubmissionInput = z.infer<typeof SubmissionInput>;

export type CheckResult = { ok: true; flags: string[] } | { ok: false; error: string };

/**
 * Physics check: a token cannot be generated faster than the hardware can read the
 * model's active weights once. Anything above that ceiling is rejected; unusual
 * but possible values are flagged for the moderator.
 */
export function checkSubmission(s: SubmissionInput, cat: Catalog): CheckResult {
  const model = cat.models.find((m) => m.id === s.modelId);
  if (!model) return { ok: false, error: "Unknown model" };
  const quant = cat.quants.find((q) => q.id === s.quant);
  if (!quant) return { ok: false, error: "Unknown quant" };
  const hw =
    s.hardwareKind === "gpu" ? cat.gpus.find((g) => g.id === s.hardwareId) : cat.chips.find((c) => c.id === s.hardwareId);
  if (!hw) return { ok: false, error: "Unknown hardware" };

  const ceiling = hw.bandwidthGbs / weightsGb(model.activeParamsB, quant.bitsPerWeight);
  if (s.tgTps > ceiling * 1.05) {
    return { ok: false, error: `Reported ${s.tgTps} tok/s exceeds the bandwidth ceiling of ~${ceiling.toFixed(0)} tok/s for this hardware` };
  }
  const flags: string[] = [];
  if (s.tgTps > ceiling * 0.9) flags.push("near-bandwidth-ceiling");
  if (s.tgTps < ceiling * 0.05) flags.push("very-slow-maybe-offloaded");
  if (s.hardwareKind === "gpu" && s.vramGb && "vramGb" in hw && !hw.vramGb.includes(s.vramGb)) flags.push("non-stock-vram");
  if (!s.rawOutput) flags.push("no-raw-output");
  return { ok: true, flags };
}
