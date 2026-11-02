import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pool?: Pool; __db?: Db };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

/** Shared pool; cached on globalThis so Next.js dev reloads don't leak connections. */
export function getDb(): Db {
  if (!globalForDb.__db) {
    globalForDb.__pool = new Pool({ connectionString: databaseUrl(), max: 10 });
    globalForDb.__db = drizzle(globalForDb.__pool, { schema });
  }
  return globalForDb.__db;
}

export async function closeDb() {
  await globalForDb.__pool?.end();
  globalForDb.__pool = undefined;
  globalForDb.__db = undefined;
}
