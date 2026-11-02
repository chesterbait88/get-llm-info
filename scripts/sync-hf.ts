/**
 * Re-verify the catalog against the Hugging Face API (no key needed for public repos).
 *
 *   npm run sync:hf               # report differences between models.json and HF
 *   npm run sync:hf -- --write    # apply architecture/param fixes to models.json, mark rows verified
 *   npm run sync:hf -- --discover # queue new popular models from known labs as "pending" in Postgres
 *
 * Run it somewhere with access to huggingface.co (it is weekly-cron friendly).
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { archFromConfig, diffModel } from "../src/lib/hf";
import { ModelSchema, type Model } from "../src/lib/schema";

const HF = "https://huggingface.co";
const UA = { "User-Agent": "get-llm-info-catalog-sync/0.1 (+https://github.com/chesterbait88/get-llm-info)" };
const MODELS_JSON = path.join(__dirname, "../src/db/seed/models.json");
const KNOWN_ORGS = [
  "Qwen", "google", "meta-llama", "deepseek-ai", "mistralai", "openai", "nvidia", "zai-org",
  "moonshotai", "MiniMaxAI", "ibm-granite", "microsoft", "NousResearch", "CohereLabs",
];

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function verify(write: boolean) {
  const models: Model[] = JSON.parse(fs.readFileSync(MODELS_JSON, "utf8")).map((m: unknown) => ModelSchema.parse(m));
  let changed = 0;
  for (const m of models) {
    if (!m.hfRepo) {
      console.log(`- ${m.id}: no hfRepo; skipped`);
      continue;
    }
    const [config, info] = await Promise.all([
      getJson(`${HF}/${m.hfRepo}/resolve/main/config.json`),
      getJson(`${HF}/api/models/${m.hfRepo}?expand[]=safetensors&expand[]=cardData&expand[]=createdAt`),
    ]);
    if (!config && !info) {
      console.log(`✗ ${m.id}: ${m.hfRepo} not reachable (gated, renamed or missing)`);
      continue;
    }
    const arch = config ? archFromConfig(config) : null;
    const total = (info?.safetensors as { total?: number } | undefined)?.total ?? null;
    const diffs = diffModel(m, arch, total);
    if (!diffs.length) console.log(`✓ ${m.id}`);
    for (const d of diffs) console.log(`~ ${m.id}.${d.field}: ${JSON.stringify(d.catalog)} -> ${JSON.stringify(d.upstream)}`);
    if (write && (arch || total)) {
      if (arch) Object.assign(m, { layers: arch.layers, attention: arch.attention, archSource: "config" }, arch.contextNative ? { contextNative: arch.contextNative } : {});
      if (total && diffs.some((d) => d.field === "totalParamsB")) m.totalParamsB = Math.round(total / 1e7) / 100;
      m.verified = true;
      changed++;
    }
  }
  if (write) {
    fs.writeFileSync(MODELS_JSON, JSON.stringify(models, null, 2) + "\n");
    console.log(`\nUpdated ${changed} models in ${MODELS_JSON}. Review the diff, then run npm run db:seed.`);
  }
}

async function discover() {
  const { getDb, closeDb } = await import("../src/db/client");
  const { models } = await import("../src/db/schema");
  const db = getDb();
  const existing = new Set((await db.select({ hf: models.hfRepo }).from(models)).map((r) => r.hf));
  let queued = 0;
  for (const org of KNOWN_ORGS) {
    const res = await fetch(`${HF}/api/models?author=${org}&pipeline_tag=text-generation&sort=trendingScore&limit=20`, { headers: UA });
    if (!res.ok) continue;
    for (const row of (await res.json()) as { id: string; createdAt?: string }[]) {
      if (existing.has(row.id)) continue;
      const config = await getJson(`${HF}/${row.id}/resolve/main/config.json`);
      const arch = config ? archFromConfig(config) : null;
      const info = await getJson(`${HF}/api/models/${row.id}?expand[]=safetensors`);
      const total = (info?.safetensors as { total?: number } | undefined)?.total;
      if (!arch || !total) continue;
      const totalB = Math.round(total / 1e7) / 100;
      const id = row.id.split("/")[1].toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
      await db
        .insert(models)
        .values({
          id, name: row.id.split("/")[1], lab: org, family: org, hfRepo: row.id,
          totalParamsB: totalB, activeParamsB: totalB, arch: "dense", // admin fixes MoE active params on review
          layers: arch.layers, attention: arch.attention, archSource: "config", contextNative: arch.contextNative,
          license: "Check Hugging Face", licenseClass: "unknown", modalities: ["text"], useCases: ["chat"],
          releaseDate: row.createdAt?.slice(0, 10) ?? null, ollamaTag: null, mlxRepo: null, verified: false, status: "pending",
        })
        .onConflictDoNothing();
      existing.add(row.id);
      queued++;
      console.log(`+ queued ${row.id} (${totalB}B) for review`);
    }
  }
  console.log(`Queued ${queued} new models as pending.`);
  await closeDb();
}

const args = process.argv.slice(2);
(args.includes("--discover") ? discover() : verify(args.includes("--write"))).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
