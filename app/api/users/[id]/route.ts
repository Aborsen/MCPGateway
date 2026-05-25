import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requirePermission, requireOwner } from "@/lib/auth";
import { can, isOwnerUser, primarySystemRoleFor } from "@/lib/permissions/resolve";
import { writeAdminEvent } from "@/lib/admin-events";
import { ROLES } from "@/lib/rbac";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(ROLES as unknown as [string, ...string[]]).optional(),
  password: z.string().min(6).optional(),
  suspended: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  // Base requirement: caller must be able to update users in general.
  const session = await requirePermission("users.update");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = await prisma.user.findUnique({
    where: { id },
    select: { email: true, name: true, suspendedAt: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Resolve the target's current primary role from UserRole (User.role
  // column was dropped in PR2b).
  const beforeRole = await primarySystemRoleFor(id);

  // Per-field permission checks. Each touched field requires its own
  // dedicated permission so we can give "Role Manager" access to change
  // roles without granting password resets, etc.
  if (parsed.data.role !== undefined) {
    if (!(await can(session.user.id, "users.change_role"))) {
      return NextResponse.json(
        { error: "forbidden: missing users.change_role" },
        { status: 403 },
      );
    }
  }
  if (parsed.data.password !== undefined) {
    if (!(await can(session.user.id, "users.reset_password"))) {
      return NextResponse.json(
        { error: "forbidden: missing users.reset_password" },
        { status: 403 },
      );
    }
  }
  if (parsed.data.suspended !== undefined) {
    if (!(await can(session.user.id, "users.suspend"))) {
      return NextResponse.json(
        { error: "forbidden: missing users.suspend" },
        { status: 403 },
      );
    }
  }

  // OWNER-only invariants. Touching an OWNER (the target's primary system
  // role today) OR assigning the OWNER role requires the caller to be an
  // Owner — both checks via UserRole, not the JWT.
  const touchingOwner =
    beforeRole === "OWNER" || parsed.data.role === "OWNER";
  if (touchingOwner && !(await isOwnerUser(session.user.id))) {
    return NextResponse.json(
      { error: "Only an Owner can modify an Owner or assign that role" },
      { status: 403 },
    );
  }

  // Build the user update (no role column anymore — that's a UserRole op).
  const update: Record<string, unknown> = {};
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.password) update.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  if (parsed.data.suspended !== undefined) {
    update.suspendedAt = parsed.data.suspended ? new Date() : null;
  }
  if (Object.keys(update).length > 0) {
    await prisma.user.update({ where: { id }, data: update });
  }

  // Role change: replace the target's global system-role UserRole row.
  // Custom-role and workspace-scoped assignments are untouched — those are
  // managed via /api/users/[id]/role-assignments.
  if (parsed.data.role && parsed.data.role !== beforeRole) {
    const targetSlug = parsed.data.role.toLowerCase();
    const role = await prisma.role.findUnique({
      where: { slug: targetSlug },
      select: { id: true },
    });
    if (!role) {
      return NextResponse.json(
        { error: `System role "${targetSlug}" not found — run the rbac seed` },
        { status: 500 },
      );
    }
    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: {
          userId: id,
          workspaceId: null,
          role: { isSystem: true },
        },
      }),
      prisma.userRole.create({
        data: {
          userId: id,
          roleId: role.id,
          workspaceId: null,
          grantedById: session.user.id,
        },
      }),
    ]);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (parsed.data.name && parsed.data.name !== before.name)
    changes.name = { from: before.name, to: parsed.data.name };
  if (parsed.data.role && parsed.data.role !== beforeRole)
    changes.role = { from: beforeRole, to: parsed.data.role };
  if (parsed.data.suspended !== undefined && !!before.suspendedAt !== parsed.data.suspended)
    changes.suspended = { from: !!before.suspendedAt, to: parsed.data.suspended };

  if (parsed.data.password) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: "USER_PASSWORD_CHANGED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
    });
  }
  if (changes.role) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: "USER_ROLE_CHANGED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
      details: changes.role,
    });
  }
  if (changes.suspended) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: parsed.data.suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
    });
  }
  if (changes.name) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: "USER_UPDATED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
      details: { changes },
    });
  }

  // Re-resolve to send the up-to-date primary role back to the client so
  // optimistic UIs don't have to guess.
  const afterRole = await primarySystemRoleFor(id);
  return NextResponse.json({ id, name: before.name, email: before.email, role: afterRole });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (session.user.id === id) {
    return NextResponse.json(
      { error: "You can't delete your own account" },
      { status: 400 },
    );
  }
  const before = await prisma.user.findUnique({
    where: { id },
    select: { email: true, name: true },
  });
  const beforeRole = await primarySystemRoleFor(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  if (before) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: "USER_DELETED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
      details: { email: before.email, name: before.name, role: beforeRole },
    });
  }
  return NextResponse.json({ ok: true });
}
