import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { isOwnerUser, primarySystemRolesByUserId } from "@/lib/permissions/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk soft-delete users. Gated on the users.delete permission, with one
// additional invariant: deleting an Owner-role account is still Owner-only.
// Per-user success/failure so partial results are visible. The caller is
// silently skipped if included in userIds — same self-protect rule as the
// single-user path.

const BodySchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await requirePermission("users.delete");
  if (session instanceof NextResponse) return session;
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { userIds } = parsed.data;

  // Resolve the targets up-front so we can audit each with their email +
  // primary role at the moment of deletion.
  const targets = await prisma.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
    select: { id: true, email: true, name: true },
  });
  const roleByUserId = await primarySystemRolesByUserId(targets.map((t) => t.id));
  const callerIsOwner = await isOwnerUser(session.user.id);

  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const userId of userIds) {
    if (userId === session.user.id) {
      results.push({ userId, ok: false, error: "can't delete yourself" });
      continue;
    }
    const target = targets.find((t) => t.id === userId);
    if (!target) {
      results.push({ userId, ok: false, error: "not found or already deleted" });
      continue;
    }
    if (roleByUserId.get(userId) === "OWNER" && !callerIsOwner) {
      results.push({
        userId,
        ok: false,
        error: "Only an Owner can delete an Owner account",
      });
      continue;
    }
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });
      await writeAdminEvent({
        actorId: session.user.id,
        targetUserId: userId,
        eventType: "USER_DELETED",
        targetType: "user",
        targetId: userId,
        targetLabel: target.email,
        details: {
          email: target.email,
          name: target.name,
          role: roleByUserId.get(userId) ?? "USER",
          bulk: true,
        },
      });
      results.push({ userId, ok: true });
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount > 0,
    succeeded: okCount,
    failed: results.length - okCount,
    results,
  });
}
