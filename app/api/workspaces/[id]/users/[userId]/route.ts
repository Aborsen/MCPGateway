import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermissionInWorkspace } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { parsePermissions } from "@/lib/json";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

const PutSchema = z.object({
  permissions: z.array(z.enum(["select", "insert", "update", "delete", "execute"])),
});

export async function PUT(request: Request, { params }: RouteCtx) {
  const { id: workspaceId, userId } = await params;
  const session = await requirePermissionInWorkspace(
    "workspaces.manage_data_permissions",
    workspaceId,
  );
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const perms = parsed.data.permissions;

  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, deletedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    }),
  ]);
  if (!workspace || workspace.deletedAt) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { permissions: true },
  });
  const before = existing ? parsePermissions(existing.permissions) : [];

  if (perms.length === 0) {
    if (existing) {
      await prisma.workspaceUser.delete({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      await writeAdminEvent({
        actorId: session.user.id,
        targetUserId: userId,
        eventType: "WORKSPACE_USER_REMOVED",
        targetType: "workspace",
        targetId: workspaceId,
        targetLabel: workspace.name,
        details: { workspaceName: workspace.name, userEmail: user.email, before },
      });
    }
    return NextResponse.json({ ok: true, removed: true });
  }

  await prisma.workspaceUser.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { workspaceId, userId, permissions: JSON.stringify(perms) },
    update: { permissions: JSON.stringify(perms) },
  });
  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: userId,
    eventType: "WORKSPACE_USER_PERMISSIONS_CHANGED",
    targetType: "workspace",
    targetId: workspaceId,
    targetLabel: workspace.name,
    details: {
      workspaceName: workspace.name,
      userEmail: user.email,
      before,
      after: perms,
    },
  });

  return NextResponse.json({ ok: true, removed: false });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { id: workspaceId, userId } = await params;
  // Removing a user from a workspace is workspace-scoped manage_members.
  // A workspace_admin of THIS workspace passes; a workspace_admin of ANOTHER
  // workspace does not.
  const session = await requirePermissionInWorkspace(
    "workspaces.manage_members",
    workspaceId,
  );
  if (session instanceof NextResponse) return session;

  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, deletedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    }),
  ]);
  if (!workspace || workspace.deletedAt) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const result = await prisma.workspaceUser.deleteMany({
    where: { workspaceId, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: userId,
    eventType: "WORKSPACE_USER_REMOVED",
    targetType: "workspace",
    targetId: workspaceId,
    targetLabel: workspace.name,
    details: { workspaceName: workspace.name, userEmail: user.email },
  });

  return NextResponse.json({ ok: true });
}
