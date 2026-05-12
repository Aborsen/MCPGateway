import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

const BodySchema = z.object({
  level: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"]),
});

type RouteCtx = { params: Promise<{ id: string; toolName: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const session = await requireAdmin();
  const { id: dataSourceId, toolName: rawToolName } = await params;
  const toolName = decodeURIComponent(rawToolName);
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const ds = await prisma.dataSource.findUnique({ where: { id: dataSourceId } });
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const before = await prisma.toolPermission.findUnique({
    where: { dataSourceId_toolName: { dataSourceId, toolName } },
  });

  const updated = await prisma.toolPermission.upsert({
    where: { dataSourceId_toolName: { dataSourceId, toolName } },
    create: {
      dataSourceId,
      toolName,
      level: parsed.data.level,
      classifiedBy: "admin",
      lastSeenAt: new Date(),
    },
    update: {
      level: parsed.data.level,
      classifiedBy: "admin",
    },
  });

  await writeAdminEvent({
    actorId: session.user.id,
    eventType: "TOOL_LEVEL_OVERRIDDEN",
    targetType: "tool",
    targetId: `${dataSourceId}:${toolName}`,
    targetLabel: `${ds.name} / ${toolName}`,
    details: {
      dataSource: ds.name,
      toolName,
      from: before?.level ?? null,
      to: parsed.data.level,
    },
  });

  return NextResponse.json({ ok: true, level: updated.level, classifiedBy: updated.classifiedBy });
}
