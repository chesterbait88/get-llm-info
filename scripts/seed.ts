/**
 * Upsert the seed catalog (src/db/seed/*.json) into Postgres. Idempotent: re-run
 * after editing the JSON. Seeded models are marked "approved"; models added later
 * by ingestion jobs land as "pending" for admin review.
 */
import "./env";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { loadSeedCatalog } from "../src/db/seed";

async function main() {
  const cat = loadSeedCatalog();
  const db = getDb();
  const excluded = (cols: string[]) => Object.fromEntries(cols.map((c) => [c, sql.raw(`excluded."${c.replace(/[A-Z]/g, (x) => "_" + x.toLowerCase())}"`)]));

  await db.transaction(async (tx) => {
    for (const q of cat.quants) {
      await tx.insert(t.quants).values(q).onConflictDoUpdate({ target: t.quants.id, set: excluded(["bitsPerWeight", "label", "note", "recommendable"]) });
    }
    for (const [i, e] of cat.engines.entries()) {
      await tx.insert(t.engines).values({ ...e, sortOrder: i }).onConflictDoUpdate({ target: t.engines.id, set: excluded(["name", "speedFactor", "platforms", "requiresFullGpu", "notes", "sortOrder"]) });
    }
    for (const [i, c] of cat.cpus.entries()) {
      await tx.insert(t.cpus).values({ ...c, sortOrder: i }).onConflictDoUpdate({
        target: t.cpus.id,
        set: excluded(["vendor", "series", "name", "cores", "threads", "memoryChannels", "ramTypes", "defaultMts", "avx512", "formFactor", "source", "sortOrder"]),
      });
    }
    for (const [i, g] of cat.gpus.entries()) {
      await tx.insert(t.gpus).values({ ...g, sortOrder: i }).onConflictDoUpdate({
        target: t.gpus.id,
        set: excluded(["vendor", "series", "name", "vramGb", "bandwidthGbs", "tdpW", "formFactor", "matchKeys", "isModded", "source", "sortOrder"]),
      });
    }
    for (const [i, c] of cat.chips.entries()) {
      await tx.insert(t.chips).values({ ...c, sortOrder: i }).onConflictDoUpdate({
        target: t.chips.id,
        set: excluded(["vendor", "family", "name", "memoryOptionsGb", "bandwidthGbs", "matchKeys", "source", "sortOrder"]),
      });
    }
    for (const m of cat.models) {
      const row = { ...m, note: m.note ?? null, status: "approved" as const };
      await tx.insert(t.models).values(row).onConflictDoUpdate({
        target: t.models.id,
        set: {
          ...excluded([
            "name", "lab", "family", "hfRepo", "totalParamsB", "activeParamsB", "arch", "layers", "attention", "archSource",
            "contextNative", "license", "licenseClass", "modalities", "useCases", "releaseDate", "ollamaTag", "mlxRepo",
            "legacy", "note", "verified",
          ]),
          updatedAt: sql`now()`,
        },
      });
    }
    // Seed benchmarks are replaced wholesale (keyed by source); user-promoted rows are kept.
    const seedSources = [...new Set(cat.benchmarks.map((b) => b.sourceUrl))];
    for (const src of seedSources) await tx.delete(t.benchmarks).where(sql`${t.benchmarks.sourceUrl} = ${src}`);
    if (cat.benchmarks.length) await tx.insert(t.benchmarks).values(cat.benchmarks);
  });

  console.log(
    `Seeded ${cat.models.length} models, ${cat.cpus.length} CPUs, ${cat.gpus.length} GPUs, ${cat.chips.length} chips, ` +
      `${cat.engines.length} engines, ${cat.quants.length} quants, ${cat.benchmarks.length} benchmarks.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
