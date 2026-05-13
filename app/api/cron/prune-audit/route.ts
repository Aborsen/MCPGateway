import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron hits this endpoint with `Authorization: Bearer ${CRON_SECRET}`.
// Without the secret the endpoint refuses — keeps casual web traffic from
// triggering a destructive delete.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const retentionDays = Math.max(
    1,
    Math.min(3650, Number(process.env.AUDIT_RETENTION_DAYS) || 90),
  );
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return NextResponse.json({
    ok: true,
    deletedCount: result.count,
    retentionDays,
    cutoff: cutoff.toISOString(),
  });
}
