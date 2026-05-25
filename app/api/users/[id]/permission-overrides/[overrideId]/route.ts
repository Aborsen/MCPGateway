import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; overrideId: string }> };

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { id: userId, overrideId } = await params;
  const auth = await requirePermission("permissions.manage_overrides");
  if (auth instanceof NextResponse) return auth;

  const override = await prisma.userPermissionOverride.findUnique({
    where: { id: overrideId },
    include: { user: { select: { email: true } } },
  });
  if (!override || override.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userPermissionOverride.delete({ where: { id: overrideId } });

  await writeAdminEvent({
    actorId: auth.user.id,
    targetUserId: userId,
    // Removing a GRANT is functionally a revoke of the user's bonus; removing
    // a REVOKE restores the role-derived permission. Either way the event
    // records what was removed.
    eventType:
      override.effect === "GRANT"
        ? "PERMISSION_OVERRIDE_REVOKED"
        : "PERMISSION_OVERRIDE_GRANTED",
    targetType: "permission",
    targetId: override.permissionKey,
    targetLabel: `${override.permissionKey} (removed ${override.effect.toLowerCase()})`,
    details: {
      user: override.user.email,
      permissionKey: override.permissionKey,
      workspaceId: override.workspaceId,
      effect: override.effect,
      removed: true,
    },
  });

  return NextResponse.json({ ok: true });
}
