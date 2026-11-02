import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getCatalogCached } from "@/db/queries";
import { benchmarkSubmissions } from "@/db/schema";
import { checkSubmission, SubmissionInput } from "@/lib/submission";

export const dynamic = "force-dynamic";

/**
 * Self-reported benchmark run (the "Self-reported" trust tier). Stored as
 * "pending"; a moderator promotes it into `benchmarks`.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = SubmissionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission", issues: parsed.error.issues }, { status: 400 });
  }
  const db = getDb();
  const check = checkSubmission(parsed.data, await getCatalogCached(db));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });

  const [row] = await db
    .insert(benchmarkSubmissions)
    .values({ ...parsed.data, flags: check.flags })
    .returning({ id: benchmarkSubmissions.id, status: benchmarkSubmissions.status });
  return NextResponse.json({ ...row, flags: check.flags }, { status: 201 });
}
