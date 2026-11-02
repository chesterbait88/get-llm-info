/** Seed catalog (validated). Loaded into Postgres by scripts/seed.ts and used as test fixtures. */
import { CatalogSchema, type Catalog } from "@/lib/schema";
import models from "./models.json";
import quants from "./quants.json";
import cpus from "./cpus.json";
import gpus from "./gpus.json";
import chips from "./chips.json";
import engines from "./engines.json";
import benchmarks from "./benchmarks.json";

export function loadSeedCatalog(): Catalog {
  return CatalogSchema.parse({ models, quants, cpus, gpus, chips, engines, benchmarks });
}
