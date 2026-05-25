import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Who has access to what" CSV. One row per UserRole assignment + one row
// per active UserPermissionOverride. The compliance answer to "show me
// everyone with admin powers" is one filter on the `role_slug` column.
//
// Required permission: permissions.view (same gate as the admin pages).
export async function GET() {
  const auth = await requirePermission("permissions.view");
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const [assignments, overrides] = await Promise.all([
    prisma.userRole.findMany({
      where: { user: { deletedAt: null } },
      include: {
        user: { select: { email: true, name: true } },
        role: { select: { slug: true, name: true, isSystem: true } },
        workspace: { select: { name: true } },
        grantedBy: { select: { email: true } },
      },
      orderBy: [{ user: { email: "asc" } }, { grantedAt: "asc" }],
    }),
    prisma.userPermissionOverride.findMany({
      where: {
        user: { deletedAt: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        user: { select: { email: true, name: true } },
        workspace: { select: { name: true } },
        grantedBy: { select: { email: true } },
      },
      orderBy: [{ user: { email: "asc" } }, { grantedAt: "asc" }],
    }),
  ]);

  const header = [
    "type",
    "user_email",
    "user_name",
    "role_slug",
    "role_name",
    "role_is_system",
    "permission_key",
    "effect",
    "scope",
    "workspace_name",
    "reason",
    "granted_by_email",
    "granted_at",
    "expires_at",
  ];

  const lines: string[] = [header.join(",")];

  for (const a of assignments) {
    lines.push(
      [
        "role_assignment",
        a.user.email,
        a.user.name,
        a.role.slug,
        a.role.name,
        a.role.isSystem ? "true" : "false",
        "", // permission_key
        "", // effect
        a.workspaceId ? "workspace" : "global",
        a.workspace?.name ?? "",
        "", // reason
        a.grantedBy?.email ?? "",
        a.grantedAt.toISOString(),
        "", // expires_at
      ]
        .map(csvField)
        .join(","),
    );
  }

  for (const o of overrides) {
    lines.push(
      [
        "permission_override",
        o.user.email,
        o.user.name,
        "", // role_slug
        "", // role_name
        "", // role_is_system
        o.permissionKey,
        o.effect,
        o.workspaceId ? "workspace" : "global",
        o.workspace?.name ?? "",
        o.reason ?? "",
        o.grantedBy?.email ?? "",
        o.grantedAt.toISOString(),
        o.expiresAt?.toISOString() ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }

  const body = lines.join("\r\n") + "\r\n";
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="access-${today}.csv"`,
    },
  });
}

function csvField(s: string): string {
  if (s == null) return "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
