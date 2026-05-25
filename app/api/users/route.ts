import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { ROLES } from "@/lib/rbac";
import { isOwnerUser } from "@/lib/permissions/resolve";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
  // Role is a system-role slug (uppercase legacy form like "ADMIN"); we
  // translate it into a UserRole row after creating the user.
  role: z.enum(ROLES as unknown as [string, ...string[]]).default("USER"),
});

export async function GET() {
  const auth = await requirePermission("users.view");
  if (auth instanceof NextResponse) return auth;
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { workspaceUsers: true } },
    },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await requirePermission("users.create");
  if (session instanceof NextResponse) return session;
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  // Only Owners can create another Owner. Read UserRole, not the JWT.
  if (data.role === "OWNER" && !(await isOwnerUser(session.user.id))) {
    return NextResponse.json(
      { error: "Only an Owner can assign the Owner role" },
      { status: 403 },
    );
  }
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Look up the target system role by slug before we start so the create
  // can run in one transaction.
  const targetSlug = data.role.toLowerCase();
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

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email: data.email, name: data.name, passwordHash },
    });
    await tx.userRole.create({
      data: {
        userId: u.id,
        roleId: role.id,
        workspaceId: null,
        grantedById: session.user.id,
      },
    });
    return u;
  });

  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: user.id,
    eventType: "USER_CREATED",
    targetType: "user",
    targetId: user.id,
    targetLabel: user.email,
    details: { email: user.email, name: user.name, role: data.role },
  });
  return NextResponse.json(user, { status: 201 });
}
