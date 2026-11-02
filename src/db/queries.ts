import { asc, eq } from "drizzle-orm";
import { CatalogSchema, type Catalog } from "@/lib/schema";
import type { Db } from "./client";
import * as t from "./schema";

/**
 * Load the approved catalog in the shape the estimator expects. Validated with
 * Zod so a bad row fails loudly on the server instead of silently in the UI.
 */
export async function getCatalog(db: Db): Promise<Catalog> {
  const [models, quants, gpus, chips, engines, benchmarks] = await Promise.all([
    db.select().from(t.models).where(eq(t.models.status, "approved")).orderBy(asc(t.models.totalParamsB)),
    db.select().from(t.quants).orderBy(asc(t.quants.bitsPerWeight)),
    db.select().from(t.gpus).orderBy(asc(t.gpus.sortOrder)),
    db.select().from(t.chips).orderBy(asc(t.chips.sortOrder)),
    db.select().from(t.engines).orderBy(asc(t.engines.sortOrder)),
    db.select().from(t.benchmarks),
  ]);
  const approved = new Set(models.map((m) => m.id));
  return CatalogSchema.parse({
    models: models.map(({ status, createdAt, updatedAt, note, ...m }) => ({ ...m, ...(note ? { note } : {}) })),
    quants,
    gpus: gpus.map(({ sortOrder, ...g }) => g),
    chips: chips.map(({ sortOrder, ...c }) => c),
    engines: engines.map(({ sortOrder, ...e }) => e),
    benchmarks: benchmarks.filter((b) => approved.has(b.modelId)).map(({ id, createdAt, ...b }) => b),
  });
}

// Small in-process cache: the catalog changes weekly at most.
let cached: { at: number; catalog: Catalog } | null = null;
const TTL_MS = 60_000;

export async function getCatalogCached(db: Db): Promise<Catalog> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.catalog;
  const catalog = await getCatalog(db);
  cached = { at: Date.now(), catalog };
  return catalog;
}

export function invalidateCatalogCache() {
  cached = null;
}
