import { getDb } from "@/db/client";
import { getCatalogCached } from "@/db/queries";
import { Matcher } from "@/components/Matcher";

// Read the catalog from Postgres per request (cached in-process for 60 s).
export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getCatalogCached(getDb());
  return <Matcher catalog={catalog} />;
}
