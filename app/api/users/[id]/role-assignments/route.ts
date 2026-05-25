import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireOwner } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  roleId: z.string().min(1),
  workspaceId: z.string().nullable().default(null),
});

// Assign a role to a user, optionally scoped to a workspace.
// Owner-role assignment goes through requireOwner — only an Owner can mint
// another Owner. Other role assignments require permissions.manage_assignments.
export async function POST(request: Request, { params }: RouteCtx) {
  const { id: userId } = await params;
  // Base gate: caller must be able to author role assignments.
  const baseAuth = await requirePermission("permissions.manage_assignments");
  if (baseAuth instanceof NextResponse) return baseAuth;

  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { roleId, workspaceId } = parsed.data;

  const [target, role, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    }),
    prisma.role.findUnique({ where: { id: roleId } }),
    workspaceId
      ? prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { name: true, deletedAt: true },
        })
      : Promise.resolve(null),
  ]);

  if (!target || target.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (workspaceId && (!workspace || workspace.deletedAt)) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Owner-only: assigning the owner role.
  if (role.slug === "owner") {
    const ownerAuth = await requireOwner();
    if (ownerAuth instanceof NextResponse) return ownerAuth;
  }

  try {
    const assignment = await prisma.userRole.create({
      data: {
        userId,
        roleId,
        workspaceId: workspaceId ?? null,
        grantedById: baseAuth.user.id,
      },
    });

    await writeAdminEvent({
      actorId: baseAuth.user.id,
      targetUserId: userId,
      eventType: "ROLE_ASSIGNED",
      targetType: "role",
      targetId: roleId,
      targetLabel: role.name,
      details: {
        user: target.email,
        role: role.name,
        workspace: workspace?.name ?? null,
      },
    });

    return NextResponse.json({ id: assignment.id }, { status: 201 });
  } catch (err) {
    // P2002 = unique constraint violation on (userId, roleId, workspaceId).
    if (err instanceof Error && err.message.includes("P2002")) {
      return NextResponse.json(
        { error: "User already has this role with the same scope" },
        { status: 409 },
      );
    }
    throw err;
  }
}
