/** Integration test: seed -> Postgres -> getCatalog round-trip. Skipped without DATABASE_URL. */
import { afterAll, describe, expect, it } from "vitest";
import "../../scripts/env";
import { loadSeedCatalog } from "./seed";

const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("getCatalog (Postgres)", () => {
  afterAll(async () => {
    const { closeDb } = await import("./client");
    await closeDb();
  });

  it("returns the seeded catalog, approved models only", async () => {
    const { getDb } = await import("./client");
    const { getCatalog } = await import("./queries");
    const cat = await getCatalog(getDb());
    const seed = loadSeedCatalog();
    expect(cat.models.length).toBe(seed.models.length);
    expect(cat.gpus.map((g) => g.id)).toEqual(seed.gpus.map((g) => g.id));
    const llama = cat.models.find((m) => m.id === "llama-3.1-8b");
    expect(llama).toEqual(seed.models.find((m) => m.id === "llama-3.1-8b"));
    expect(cat.benchmarks.length).toBe(seed.benchmarks.length);
  });
});
