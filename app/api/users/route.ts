import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { ROLES } from "@/lib/rbac";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
  role: z.enum(ROLES as unknown as [string, ...string[]]).default("USER"),
});

export async function GET() {
  const auth = await requireAdmin();
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
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  // Only Owners can create another Owner.
  if (data.role === "OWNER" && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only an Owner can assign the Owner role" },
      { status: 403 },
    );
  }
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { email: data.email, name: data.name, role: data.role, passwordHash },
  });
  await writeAdminEvent({
    actorId: session.user.id,
    targetUserId: user.id,
    eventType: "USER_CREATED",
    targetType: "user",
    targetId: user.id,
    targetLabel: user.email,
    details: { email: user.email, name: user.name, role: user.role },
  });
  return NextResponse.json(user, { status: 201 });
}
