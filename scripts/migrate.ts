/** Apply SQL migrations from ./drizzle to DATABASE_URL. */
import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db/client";

async function main() {
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
