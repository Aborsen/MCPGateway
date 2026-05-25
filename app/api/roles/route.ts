import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List all roles (system + custom) with their permission keys.
export async function GET() {
  const auth = await requirePermission("permissions.view");
  if (auth instanceof NextResponse) return auth;

  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      rolePermissions: { select: { permissionKey: true } },
      _count: { select: { assignments: true } },
    },
  });
  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.rolePermissions.map((rp) => rp.permissionKey),
      assignmentCount: r._count.assignments,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
}

const CreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, '-' or '_'"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(""),
  permissions: z.array(z.string()).default([]),
});

// Create a custom role. System roles are seeded; custom roles are user-authored
// here. Slug must be unique. Permission keys are validated against the catalog
// (the const tuple in lib/permissions/catalog.ts) so typos never reach the DB.
export async function POST(request: Request) {
  const auth = await requirePermission("permissions.manage_roles");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  // Reject any permission key that's not in the catalog.
  const invalid = data.permissions.filter(
    (k) => !PERMISSION_KEYS.has(k as never),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown permission keys: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  // Slug collision check (incl. against system roles).
  const existing = await prisma.role.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return NextResponse.json(
      { error: `Role with slug "${data.slug}" already exists` },
      { status: 409 },
    );
  }

  const role = await prisma.role.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description,
      isSystem: false,
      rolePermissions: {
        create: data.permissions.map((permissionKey) => ({ permissionKey })),
      },
    },
  });

  await writeAdminEvent({
    actorId: auth.user.id,
    eventType: "ROLE_CREATED",
    targetType: "role",
    targetId: role.id,
    targetLabel: role.name,
    details: { slug: role.slug, permissions: data.permissions },
  });

  return NextResponse.json({ id: role.id, slug: role.slug }, { status: 201 });
}
