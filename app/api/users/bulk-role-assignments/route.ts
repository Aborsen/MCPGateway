import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireOwner } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk assign one role to many users. Returns per-user success/failure so
// the UI can show partial progress (e.g. one user already had the role).
// Best-effort semantics — failures don't roll back successes.

const BodySchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
  roleId: z.string().min(1),
  workspaceId: z.string().nullable().default(null),
});

export async function POST(request: Request) {
  const auth = await requirePermission("permissions.manage_assignments");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { userIds, roleId, workspaceId } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  // Owner role escalation: same guard as the single-assign endpoint.
  if (role.slug === "owner") {
    const ownerAuth = await requireOwner();
    if (ownerAuth instanceof NextResponse) return ownerAuth;
  }
  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true },
    });
    if (!ws || ws.deletedAt) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
  }

  // System roles REPLACE the user's global system-role row (matches the
  // single-user PATCH /api/users/[id] semantics). Custom roles ADD on top
  // of the existing assignments (since a user can hold multiple custom
  // roles at once).
  const isSystemReplace = role.isSystem && workspaceId === null;

  const results: { userId: string; ok: boolean; error?: string; id?: string }[] = [];
  for (const userId of userIds) {
    try {
      let assignmentId: string;
      if (isSystemReplace) {
        const [, created] = await prisma.$transaction([
          prisma.userRole.deleteMany({
            where: {
              userId,
              workspaceId: null,
              role: { isSystem: true },
            },
          }),
          prisma.userRole.create({
            data: {
              userId,
              roleId,
              workspaceId: null,
              grantedById: auth.user.id,
            },
          }),
        ]);
        assignmentId = created.id;
      } else {
        const created = await prisma.userRole.create({
          data: {
            userId,
            roleId,
            workspaceId: workspaceId ?? null,
            grantedById: auth.user.id,
          },
        });
        assignmentId = created.id;
      }
      await writeAdminEvent({
        actorId: auth.user.id,
        targetUserId: userId,
        eventType: "ROLE_ASSIGNED",
        targetType: "role",
        targetId: roleId,
        targetLabel: role.name,
        details: {
          role: role.name,
          workspaceId: workspaceId ?? null,
          replaced: isSystemReplace,
          bulk: true,
        },
      });
      results.push({ userId, ok: true, id: assignmentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // P2002 = already assigned. Treat as a soft failure with a hint.
      const friendly = message.includes("P2002")
        ? "already assigned"
        : message;
      results.push({ userId, ok: false, error: friendly });
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
