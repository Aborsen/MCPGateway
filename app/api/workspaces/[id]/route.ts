import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermissionInWorkspace } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions/resolve";

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
        permissions: z.array(z.enum(["select", "insert", "update", "delete", "execute"])),
      }),
    )
    .optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { id } = await params;
  // Base requirement: caller must have workspaces.update on this workspace
  // (globally or workspace-scoped via UserRole(workspaceId=id)).
  const session = await requirePermissionInWorkspace("workspaces.update", id);
  if (session instanceof NextResponse) return session;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  // Per-section sub-permission checks. Each touched section needs the
  // matching workspace-scoped permission. PR4 surfaces these distinctions
  // in the workspace editor UI; PR2 keeps the endpoint shape but enforces
  // them correctly.
  if (data.dataSources !== undefined) {
    if (!(await canInWorkspace(session.user.id, "workspaces.manage_data_sources", id))) {
      return NextResponse.json(
        { error: "forbidden: missing workspaces.manage_data_sources" },
        { status: 403 },
      );
    }
  }
  if (data.users !== undefined) {
    if (!(await canInWorkspace(session.user.id, "workspaces.manage_members", id))) {
      return NextResponse.json(
        { error: "forbidden: missing workspaces.manage_members" },
        { status: 403 },
      );
    }
    // The users array also carries each member's SQL-level permissions
    // (select/insert/update/delete/execute). Setting those requires the
    // separate data-permissions grant.
    if (
      data.users.some((u) => u.permissions.length > 0) &&
      !(await canInWorkspace(session.user.id, "workspaces.manage_data_permissions", id))
    ) {
      return NextResponse.json(
        { error: "forbidden: missing workspaces.manage_data_permissions" },
        { status: 403 },
      );
    }
  }

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
  const { id } = await params;
  const session = await requirePermissionInWorkspace("workspaces.delete", id);
  if (session instanceof NextResponse) return session;
  await prisma.workspace.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
