import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requirePermission, requireOwner } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { syncUserRoleMirror } from "@/lib/permissions/sync";
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
    select: { email: true, name: true, role: true, suspendedAt: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  // OWNER-only invariants (enforced in code, not in the role definition):
  //   * Editing a user who currently has the OWNER role.
  //   * Assigning the OWNER role.
  //   * Demoting an OWNER to a lower role.
  const touchingOwner =
    before.role === "OWNER" ||
    parsed.data.role === "OWNER" ||
    (parsed.data.role && before.role === "OWNER");
  if (touchingOwner && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only an Owner can modify an Owner or assign that role" },
      { status: 403 },
    );
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.role) update.role = parsed.data.role;
  if (parsed.data.password) update.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  if (parsed.data.suspended !== undefined) {
    update.suspendedAt = parsed.data.suspended ? new Date() : null;
  }
  const updated = await prisma.user.update({ where: { id }, data: update });

  // When the legacy User.role string changes, mirror the new role into a
  // UserRole row so the new-RBAC engine (USE_NEW_RBAC=true) sees the change
  // immediately. Without this, role edits silently no-op because the
  // resolver reads UserRole, not User.role.
  if (parsed.data.role && parsed.data.role !== before.role) {
    await syncUserRoleMirror(id, parsed.data.role);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (parsed.data.name && parsed.data.name !== before.name)
    changes.name = { from: before.name, to: parsed.data.name };
  if (parsed.data.role && parsed.data.role !== before.role)
    changes.role = { from: before.role, to: parsed.data.role };
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
  if (Object.keys(changes).length > 0 || (!parsed.data.password && !changes.role)) {
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

  return NextResponse.json(updated);
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
    select: { email: true, name: true, role: true },
  });
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  if (before) {
    await writeAdminEvent({
      actorId: session.user.id,
      targetUserId: id,
      eventType: "USER_DELETED",
      targetType: "user",
      targetId: id,
      targetLabel: before.email,
      details: { email: before.email, name: before.name, role: before.role },
    });
  }
  return NextResponse.json({ ok: true });
}
