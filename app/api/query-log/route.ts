import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const days = Math.max(1, Math.min(30, Number(searchParams.get("days")) || 7));
  const userId = searchParams.get("userId");
  const dataSourceId = searchParams.get("dataSourceId");

  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: cutoff },
      ...(userId && userId !== "all" ? { userId } : {}),
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
