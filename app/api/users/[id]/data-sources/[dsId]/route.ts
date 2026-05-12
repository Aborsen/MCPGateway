import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

const BodySchema = z.object({
  permissions: z.array(z.enum(["select", "insert", "update", "delete", "execute"])),
  allowedTables: z.array(z.string()).nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string; dsId: string }> };

export async function PUT(request: Request, { params }: RouteCtx) {
  const session = await requireAdmin();
  const { id: userId, dsId: dataSourceId } = await params;
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const [user, dataSource] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.dataSource.findUnique({ where: { id: dataSourceId } }),
  ]);
  if (!user || user.deletedAt || !dataSource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Empty permissions = delete the grant.
  if (parsed.data.permissions.length === 0) {
    await prisma.userDataSourceAccess
      .delete({ where: { userId_dataSourceId: { userId, dataSourceId } } })
      .catch(() => undefined);
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: userId,
      eventType: "USER_DATA_SOURCE_ACCESS_REVOKED",
      targetType: "dataSource",
      targetId: dataSourceId,
      targetLabel: dataSource.name,
      details: { user: user.email, dataSource: dataSource.name },
    });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const permissionsJson = JSON.stringify(parsed.data.permissions);
  const allowedTablesJson =
    parsed.data.allowedTables === undefined
      ? null
      : parsed.data.allowedTables === null
        ? null
        : JSON.stringify(parsed.data.allowedTables);

  const upserted = await prisma.userDataSourceAccess.upsert({
    where: { userId_dataSourceId: { userId, dataSourceId } },
    create: {
      userId,
      dataSourceId,
      permissions: permissionsJson,
      allowedTables: allowedTablesJson,
    },
    update: {
      permissions: permissionsJson,
      allowedTables: allowedTablesJson,
    },
  });

  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: userId,
    eventType: "USER_DATA_SOURCE_ACCESS_CHANGED",
    targetType: "dataSource",
    targetId: dataSourceId,
    targetLabel: dataSource.name,
    details: {
      user: user.email,
      dataSource: dataSource.name,
      permissions: parsed.data.permissions,
      allowedTables: parsed.data.allowedTables ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: upserted.id });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const session = await requireAdmin();
  const { id: userId, dsId: dataSourceId } = await params;
  const ds = await prisma.dataSource.findUnique({ where: { id: dataSourceId } });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.userDataSourceAccess
    .delete({ where: { userId_dataSourceId: { userId, dataSourceId } } })
    .catch(() => undefined);
  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: userId,
    eventType: "USER_DATA_SOURCE_ACCESS_REVOKED",
    targetType: "dataSource",
    targetId: dataSourceId,
    targetLabel: ds?.name ?? dataSourceId,
    details: { user: user?.email ?? userId, dataSource: ds?.name },
  });
  return NextResponse.json({ ok: true });
}
