import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { primarySystemRolesByUserId } from "@/lib/permissions/resolve";

export const dynamic = "force-dynamic";

// CSV export of every non-deleted user. Used by the page-header "Export CSV"
// button. Excel/Sheets-compatible: CRLF line endings, fields containing
// commas/quotes/newlines are quoted with embedded quotes doubled.

export async function GET() {
  const auth = await requirePermission("users.view");
  if (auth instanceof NextResponse) return auth;

  const [users, activeRows] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { workspaceUsers: true } },
        workspaceUsers: {
          select: { workspace: { select: { name: true } } },
        },
      },
    }),
    prisma.oidcModel.findMany({
      where: { model: "AccessToken", expiresAt: { gt: new Date() }, consumedAt: null },
      select: { payload: true },
    }),
  ]);

  const activeIds = new Set<string>();
  for (const r of activeRows) {
    const aid = (r.payload as { accountId?: string } | null)?.accountId;
    if (aid) activeIds.add(aid);
  }

  const lastActivityByUser = new Map<string, Date>();
  const lastActivityRows = await prisma.auditLog.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) } },
    _max: { createdAt: true },
  });
  for (const r of lastActivityRows) {
    if (r.userId && r._max.createdAt) lastActivityByUser.set(r.userId, r._max.createdAt);
  }

  // PR2b: roles come from UserRole, not User.role. Batched query.
  const roleByUserId = await primarySystemRolesByUserId(users.map((u) => u.id));

  const headers = [
    "name",
    "email",
    "role",
    "workspace_count",
    "workspaces",
    "mcp_status",
    "last_active",
    "suspended",
    "created_at",
  ];
  const lines: string[] = [headers.join(",")];

  for (const u of users) {
    const workspaceNames = u.workspaceUsers.map((w) => w.workspace.name).join("; ");
    const lastActive = lastActivityByUser.get(u.id);
    lines.push(
      [
        u.name,
        u.email,
        roleByUserId.get(u.id) ?? "USER",
        String(u._count.workspaceUsers),
        workspaceNames,
        activeIds.has(u.id) ? "active" : "inactive",
        lastActive ? lastActive.toISOString() : "",
        u.suspendedAt ? "true" : "false",
        u.createdAt.toISOString(),
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
      "Content-Disposition": `attachment; filename="users-${today}.csv"`,
    },
  });
}

function csvField(s: string): string {
  if (s == null) return "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
