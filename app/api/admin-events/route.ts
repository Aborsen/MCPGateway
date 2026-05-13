import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(searchParams.get("days")) || 7));
  const eventType = searchParams.get("eventType");
  const actorId = searchParams.get("actorId");

  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const rows = await prisma.adminEvent.findMany({
    where: {
      createdAt: { gte: cutoff },
      ...(eventType && eventType !== "all" ? { eventType } : {}),
      ...(actorId && actorId !== "all" ? { actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      actor: { select: { id: true, name: true, email: true } },
      targetUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      eventType: r.eventType,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      detailsJson: r.detailsJson,
      actor: r.actor,
      targetUser: r.targetUser,
    })),
  );
}
