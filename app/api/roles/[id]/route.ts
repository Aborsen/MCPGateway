import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";

type RouteCtx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  // Whole-set replacement: caller submits the desired final permission set
  // and the route diffs against what's stored. Simpler for the UI than
  // separate add/remove endpoints.
  permissions: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: RouteCtx) {
  const auth = await requirePermission("permissions.manage_roles");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  const before = await prisma.role.findUnique({
    where: { id },
    include: { rolePermissions: { select: { permissionKey: true } } },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (before.isSystem) {
    return NextResponse.json(
      { error: "System roles are read-only" },
      { status: 403 },
    );
  }

  if (data.permissions) {
    const invalid = data.permissions.filter((k) => !PERMISSION_KEYS.has(k as never));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown permission keys: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (Object.keys(update).length > 0) {
      await tx.role.update({ where: { id }, data: update });
    }

    if (data.permissions !== undefined) {
      const wantSet = new Set(data.permissions);
      const haveSet = new Set(before.rolePermissions.map((rp) => rp.permissionKey));
      const toAdd = [...wantSet].filter((k) => !haveSet.has(k));
      const toRemove = [...haveSet].filter((k) => !wantSet.has(k));
      if (toRemove.length > 0) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id, permissionKey: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.rolePermission.createMany({
          data: toAdd.map((permissionKey) => ({ roleId: id, permissionKey })),
          skipDuplicates: true,
        });
      }
    }
  });

  await writeAdminEvent({
    actorId: auth.user.id,
    eventType: "ROLE_UPDATED",
    targetType: "role",
    targetId: id,
    targetLabel: before.name,
    details: {
      changes: {
        ...(data.name && data.name !== before.name
          ? { name: { from: before.name, to: data.name } }
          : {}),
        ...(data.description !== undefined && data.description !== before.description
          ? { description: { from: before.description, to: data.description } }
          : {}),
        ...(data.permissions
          ? {
              permissions: {
                from: before.rolePermissions.map((rp) => rp.permissionKey).sort(),
                to: [...data.permissions].sort(),
              },
            }
          : {}),
      },
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const auth = await requirePermission("permissions.manage_roles");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const before = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (before.isSystem) {
    return NextResponse.json(
      { error: "System roles cannot be deleted" },
      { status: 403 },
    );
  }
  if (before._count.assignments > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete role: ${before._count.assignments} user(s) still assigned. Unassign them first.`,
      },
      { status: 409 },
    );
  }

  await prisma.role.delete({ where: { id } });

  await writeAdminEvent({
    actorId: auth.user.id,
    eventType: "ROLE_DELETED",
    targetType: "role",
    targetId: id,
    targetLabel: before.name,
    details: { slug: before.slug },
  });

  return NextResponse.json({ ok: true });
}
