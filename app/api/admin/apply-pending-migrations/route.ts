import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot migration applier. Same auth model as the audit-prune cron —
// requires Authorization: Bearer ${CRON_SECRET}. Idempotent (IF NOT EXISTS
// everywhere) so re-running is safe.
//
// REMOVE this endpoint after the prod schema is up to date. It's only here
// because Vercel's CLI redacts production secrets, so we can't run
// `prisma db push` / `prisma migrate deploy` from a local shell.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pending migrations as raw SQL. Each statement is idempotent.
  const statements: { name: string; sql: string }[] = [
    {
      name: "Workspace.mcpUid column",
      sql: `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "mcpUid" TEXT;`,
    },
    {
      name: "Workspace.mcpUid unique index",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_mcpUid_key" ON "Workspace"("mcpUid");`,
    },
    {
      name: "AuditLog.method index",
      sql: `CREATE INDEX IF NOT EXISTS "AuditLog_method_createdAt_idx" ON "AuditLog"("method", "createdAt");`,
    },
    {
      name: "AuditLog.dataSourceId index",
      sql: `CREATE INDEX IF NOT EXISTS "AuditLog_dataSourceId_createdAt_idx" ON "AuditLog"("dataSourceId", "createdAt");`,
    },
    {
      name: "AuditLog.status index",
      sql: `CREATE INDEX IF NOT EXISTS "AuditLog_status_createdAt_idx" ON "AuditLog"("status", "createdAt");`,
    },
  ];

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt.sql);
      results.push({ name: stmt.name, ok: true });
    } catch (err) {
      results.push({
        name: stmt.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 500 });
}
