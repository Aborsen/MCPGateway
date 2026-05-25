import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAdminEvent } from "@/lib/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily cron: delete UserPermissionOverride rows whose expiresAt has passed.
// Each deletion gets an AdminEvent so the audit trail still explains why a
// user's effective permissions changed at midnight.
//
// Auth: Vercel Cron hits this with `Authorization: Bearer ${CRON_SECRET}`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Pull the doomed rows BEFORE the delete so we can audit each one. Joining
  // user lets the audit row carry the email for later diagnostics.
  const expired = await prisma.userPermissionOverride.findMany({
    where: { expiresAt: { not: null, lte: now } },
    include: { user: { select: { id: true, email: true } } },
  });

  if (expired.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0 });
  }

  const ids = expired.map((o) => o.id);
  const result = await prisma.userPermissionOverride.deleteMany({
    where: { id: { in: ids } },
  });

  // Best-effort audit. If a single write fails we continue — losing one
  // audit row is better than losing the whole batch.
  for (const o of expired) {
    try {
      await writeAdminEvent({
        actorId: null, // system action
        targetUserId: o.userId,
        // Removing a GRANT is functionally a revoke of the bonus; removing a
        // REVOKE restores the role-derived permission. Either way the audit
        // log captures the effect of the removal.
        eventType:
          o.effect === "GRANT"
            ? "PERMISSION_OVERRIDE_REVOKED"
            : "PERMISSION_OVERRIDE_GRANTED",
        targetType: "permission",
        targetId: o.permissionKey,
        targetLabel: `${o.permissionKey} (expired)`,
        details: {
          user: o.user.email,
          permissionKey: o.permissionKey,
          workspaceId: o.workspaceId,
          effect: o.effect,
          reason: "expired by cron",
          expiredAt: o.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      console.error("[expire-overrides] audit write failed for", o.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    deletedCount: result.count,
    cutoff: now.toISOString(),
  });
}
