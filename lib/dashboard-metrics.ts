import { prisma } from "@/lib/db";

const MCP_QUERY_METHOD = "tools/call";

export type DashboardMetrics = {
  userCount: number;
  connectorCount: number;
  queries24h: number;
  errors24h: number;
  errorRate24h: number;
  byDay: Array<{ date: string; ok: number; error: number }>;
  topUsers: Array<{ userId: string; name: string; email: string; queries: number; errors: number; lastAt: string }>;
  byConnection: Array<{ dataSourceId: string; name: string; queries: number; ok: number; successRate: number }>;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const cutoff24h = new Date(now.getTime() - day);
  const cutoff7d = new Date(now.getTime() - 7 * day);

  const [userCount, connectorCount, queries24h, errors24h, byDayRaw, topUsersRaw, byConnRaw] =
    await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.dataSource.count(),
      prisma.auditLog.count({
        where: { method: MCP_QUERY_METHOD, createdAt: { gte: cutoff24h } },
      }),
      prisma.auditLog.count({
        where: { method: MCP_QUERY_METHOD, status: "ERROR", createdAt: { gte: cutoff24h } },
      }),
      prisma.auditLog.findMany({
        where: { method: MCP_QUERY_METHOD, createdAt: { gte: cutoff7d } },
        select: { createdAt: true, status: true },
      }),
      prisma.auditLog.groupBy({
        by: ["userId"],
        where: { method: MCP_QUERY_METHOD, createdAt: { gte: cutoff7d }, userId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ["dataSourceId"],
        where: { method: MCP_QUERY_METHOD, createdAt: { gte: cutoff7d }, dataSourceId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { dataSourceId: "desc" } },
        take: 10,
      }),
    ]);

  const byDay = bucketByDay(byDayRaw, now, 7);

  const topUserIds = topUsersRaw.map((r) => r.userId!).filter(Boolean);
  const [userRows, errorCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        method: MCP_QUERY_METHOD,
        createdAt: { gte: cutoff7d },
        userId: { in: topUserIds.length ? topUserIds : ["__none__"] },
        status: "ERROR",
      },
      _count: { _all: true },
    }),
  ]);
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const errorByUser = new Map(errorCounts.map((c) => [c.userId, c._count._all]));
  const topUsers = topUsersRaw.map((r) => {
    const u = userById.get(r.userId!);
    return {
      userId: r.userId!,
      name: u?.name ?? "(unknown)",
      email: u?.email ?? "",
      queries: r._count._all,
      errors: errorByUser.get(r.userId!) ?? 0,
      lastAt: (r._max.createdAt ?? new Date(0)).toISOString(),
    };
  });

  const connectorIds = byConnRaw.map((r) => r.dataSourceId!).filter(Boolean);
  const [connRows, connOkCounts] = await Promise.all([
    prisma.dataSource.findMany({
      where: { id: { in: connectorIds } },
      select: { id: true, name: true },
    }),
    prisma.auditLog.groupBy({
      by: ["dataSourceId"],
      where: {
        method: MCP_QUERY_METHOD,
        createdAt: { gte: cutoff7d },
        dataSourceId: { in: connectorIds.length ? connectorIds : ["__none__"] },
        status: "OK",
      },
      _count: { _all: true },
    }),
  ]);
  const connById = new Map(connRows.map((c) => [c.id, c]));
  const okByConn = new Map(connOkCounts.map((c) => [c.dataSourceId, c._count._all]));
  const byConnection = byConnRaw.map((r) => {
    const c = connById.get(r.dataSourceId!);
    const total = r._count._all;
    const ok = okByConn.get(r.dataSourceId!) ?? 0;
    return {
      dataSourceId: r.dataSourceId!,
      name: c?.name ?? "(unknown)",
      queries: total,
      ok,
      successRate: total > 0 ? ok / total : 0,
    };
  });

  const errorRate24h = queries24h > 0 ? errors24h / queries24h : 0;

  return {
    userCount,
    connectorCount,
    queries24h,
    errors24h,
    errorRate24h,
    byDay,
    topUsers,
    byConnection,
  };
}

function bucketByDay(
  rows: Array<{ createdAt: Date; status: string }>,
  now: Date,
  days: number,
): Array<{ date: string; ok: number; error: number }> {
  const buckets = new Map<string, { ok: number; error: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    buckets.set(dayKey(d), { ok: 0, error: 0 });
  }
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    const b = buckets.get(key);
    if (!b) continue;
    if (r.status === "ERROR") b.error++;
    else b.ok++;
  }
  return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
