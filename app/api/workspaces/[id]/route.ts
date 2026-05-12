import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  dataSources: z
    .array(
      z.object({
        dataSourceId: z.string(),
        allowedTables: z.array(z.string()).nullable(),
      }),
    )
    .optional(),
  users: z
    .array(
      z.object({
        userId: z.string(),
        permissions: z.array(z.enum(["read", "write", "delete"])),
      }),
    )
    .optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (Object.keys(update).length > 0) {
      await tx.workspace.update({ where: { id }, data: update });
    }
    if (data.dataSources !== undefined) {
      await tx.workspaceDataSource.deleteMany({ where: { workspaceId: id } });
      if (data.dataSources.length > 0) {
        await tx.workspaceDataSource.createMany({
          data: data.dataSources.map((d) => ({
            workspaceId: id,
            dataSourceId: d.dataSourceId,
            allowedTables: d.allowedTables ? JSON.stringify(d.allowedTables) : null,
          })),
        });
      }
    }
    if (data.users !== undefined) {
      await tx.workspaceUser.deleteMany({ where: { workspaceId: id } });
      if (data.users.length > 0) {
        await tx.workspaceUser.createMany({
          data: data.users.map((u) => ({
            workspaceId: id,
            userId: u.userId,
            permissions: JSON.stringify(u.permissions),
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  await prisma.workspace.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
