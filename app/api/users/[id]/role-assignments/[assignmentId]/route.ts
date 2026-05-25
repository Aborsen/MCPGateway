import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, requireOwner } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { isOwnerUser } from "@/lib/permissions/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; assignmentId: string }> };

// Remove a single role assignment. Removing an Owner assignment is gated
// by requireOwner AND we refuse to remove the last Owner (avoids locking
// the org out).
export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { id: userId, assignmentId } = await params;
  const baseAuth = await requirePermission("permissions.manage_assignments");
  if (baseAuth instanceof NextResponse) return baseAuth;

  const assignment = await prisma.userRole.findUnique({
    where: { id: assignmentId },
    include: {
      role: true,
      workspace: { select: { name: true } },
      user: { select: { email: true } },
    },
  });
  if (!assignment || assignment.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owner safety: deleting an Owner assignment requires Owner privileges AND
  // we refuse to remove the LAST Owner globally — leave at least one in place
  // so the org always has an escalation path.
  if (assignment.role.slug === "owner" && assignment.workspaceId === null) {
    const ownerAuth = await requireOwner();
    if (ownerAuth instanceof NextResponse) return ownerAuth;

    const ownerCount = await prisma.userRole.count({
      where: {
        workspaceId: null,
        role: { slug: "owner", isSystem: true },
        user: { deletedAt: null },
      },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last Owner. Promote another user first." },
        { status: 409 },
      );
    }

    // Self-protection: you can't remove your own Owner role. Promote
    // someone else, have them remove yours.
    if (assignment.userId === ownerAuth.user.id) {
      return NextResponse.json(
        { error: "You can't remove your own Owner role." },
        { status: 409 },
      );
    }
  }

  await prisma.userRole.delete({ where: { id: assignmentId } });

  await writeAdminEvent({
    actorId: baseAuth.user.id,
    targetUserId: userId,
    eventType: "ROLE_UNASSIGNED",
    targetType: "role",
    targetId: assignment.roleId,
    targetLabel: assignment.role.name,
    details: {
      user: assignment.user.email,
      role: assignment.role.name,
      workspace: assignment.workspace?.name ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

// Silence unused-import warning — isOwnerUser is referenced through
// requireOwner above (transitively) but kept in scope for clarity.
void isOwnerUser;
