import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  password: z.string().min(6).optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = await prisma.user.findUnique({
    where: { id },
    select: { email: true, name: true, role: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.role) update.role = parsed.data.role;
  if (parsed.data.password) update.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const updated = await prisma.user.update({ where: { id }, data: update });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (parsed.data.name && parsed.data.name !== before.name)
    changes.name = { from: before.name, to: parsed.data.name };
  if (parsed.data.role && parsed.data.role !== before.role)
    changes.role = { from: before.role, to: parsed.data.role };

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
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
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
