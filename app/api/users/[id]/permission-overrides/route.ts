import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  permissionKey: z.string().min(1),
  workspaceId: z.string().nullable().default(null),
  effect: z.enum(["GRANT", "REVOKE"]),
  reason: z.string().min(1).max(500),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Author a per-user permission override (GRANT or REVOKE) on top of the
// user's role assignments. `reason` is mandatory by the schema so the audit
// trail always has a justification.
export async function POST(request: Request, { params }: RouteCtx) {
  const { id: userId } = await params;
  const auth = await requirePermission("permissions.manage_overrides");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  // Catalog check: refuse unknown permission keys outright.
  if (!PERMISSION_KEYS.has(data.permissionKey as never)) {
    return NextResponse.json(
      { error: `Unknown permission key: ${data.permissionKey}` },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, deletedAt: true },
  });
  if (!target || target.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const override = await prisma.userPermissionOverride.create({
      data: {
        userId,
        permissionKey: data.permissionKey,
        workspaceId: data.workspaceId ?? null,
        effect: data.effect,
        reason: data.reason,
        grantedById: auth.user.id,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    await writeAdminEvent({
      actorId: auth.user.id,
      targetUserId: userId,
      eventType:
        data.effect === "GRANT"
          ? "PERMISSION_OVERRIDE_GRANTED"
          : "PERMISSION_OVERRIDE_REVOKED",
      targetType: "permission",
      targetId: data.permissionKey,
      targetLabel: `${data.permissionKey} (${data.effect.toLowerCase()})`,
      details: {
        user: target.email,
        permissionKey: data.permissionKey,
        workspaceId: data.workspaceId ?? null,
        effect: data.effect,
        reason: data.reason,
        expiresAt: data.expiresAt ?? null,
      },
    });

    return NextResponse.json({ id: override.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("P2002")) {
      return NextResponse.json(
        { error: "An override with the same scope and effect already exists." },
        { status: 409 },
      );
    }
    throw err;
  }
}
