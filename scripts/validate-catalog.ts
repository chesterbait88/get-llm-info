/** Validate the seed catalog: schema + referential integrity + duplicate ids. Exits 1 on error. */
import { loadSeedCatalog } from "../src/db/seed";

const errors: string[] = [];
let cat;
try {
  cat = loadSeedCatalog();
} catch (err) {
  console.error("Schema validation failed:\n", err);
  process.exit(1);
}

const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
for (const [name, list] of Object.entries({ models: cat.models, gpus: cat.gpus, chips: cat.chips, engines: cat.engines, quants: cat.quants })) {
  for (const d of dupes(list.map((x) => x.id))) errors.push(`duplicate ${name} id: ${d}`);
}
const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
const models = ids(cat.models), gpus = ids(cat.gpus), chips = ids(cat.chips), quants = ids(cat.quants), engines = ids(cat.engines);
for (const b of cat.benchmarks) {
  if (!models.has(b.modelId)) errors.push(`benchmark references unknown model ${b.modelId}`);
  if (!quants.has(b.quant)) errors.push(`benchmark references unknown quant ${b.quant}`);
  if (!engines.has(b.engine)) errors.push(`benchmark references unknown engine ${b.engine}`);
  if (!(b.hardwareKind === "gpu" ? gpus : chips).has(b.hardwareId)) errors.push(`benchmark references unknown ${b.hardwareKind} ${b.hardwareId}`);
}
for (const m of cat.models) {
  if (m.activeParamsB > m.totalParamsB) errors.push(`${m.id}: active params exceed total`);
  if (m.arch === "moe" && m.activeParamsB === m.totalParamsB) errors.push(`${m.id}: MoE with active == total`);
  const att = m.attention;
  if (att.fullLayers + att.slidingLayers > m.layers) errors.push(`${m.id}: more attention layers than layers`);
  if (att.slidingLayers && !att.window) errors.push(`${m.id}: sliding layers without a window`);
}

const unverified = cat.models.filter((m) => !m.verified).length;
const estimatedArch = cat.models.filter((m) => m.archSource === "estimated").length;
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ Catalog OK: ${cat.models.length} models (${unverified} unverified, ${estimatedArch} with estimated architecture), ${cat.gpus.length} GPUs, ${cat.chips.length} chips, ${cat.benchmarks.length} benchmarks.`);
