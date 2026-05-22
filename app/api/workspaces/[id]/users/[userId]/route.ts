import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermissionInWorkspace } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

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
