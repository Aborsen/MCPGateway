import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";

// Query log endpoint. PR4 makes this scope-aware:
//   - audit.view_all → see every user's rows; ?userId filter respected
//   - audit.view_own → see only your own rows; ?userId is ignored if it
//                       doesn't match the caller (no peeking at others)
//   - neither       → 403
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [viewOwn, viewAll] = await Promise.all([
    can(session.user.id, "audit.view_own"),
    can(session.user.id, "audit.view_all"),
  ]);
  if (!viewOwn && !viewAll) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.max(1, Math.min(30, Number(searchParams.get("days")) || 7));
  const requestedUserId = searchParams.get("userId");
  const dataSourceId = searchParams.get("dataSourceId");

  // Force the per-row filter to the caller's own id when they only have
  // view_own, regardless of what they passed. view_all callers can filter
  // freely.
  const effectiveUserId = viewAll
    ? requestedUserId && requestedUserId !== "all"
      ? requestedUserId
      : null
    : session.user.id;

  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: cutoff },
      ...(effectiveUserId ? { userId: effectiveUserId } : {}),
      ...(dataSourceId && dataSourceId !== "all" ? { dataSourceId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      user: { select: { id: true, name: true } },
      dataSource: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      method: r.method,
      toolName: r.toolName,
      requestJson: r.requestJson,
      responseJson: r.responseJson,
      status: r.status,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
      user: r.user,
      dataSource: r.dataSource,
    })),
  );
}
