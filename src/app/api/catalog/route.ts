import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getCatalogCached } from "@/db/queries";

export const dynamic = "force-dynamic";

/** The approved catalog as JSON (models, quants, hardware, engines, benchmarks). */
export async function GET() {
  const catalog = await getCatalogCached(getDb());
  return NextResponse.json(catalog, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
}
