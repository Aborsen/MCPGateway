import { auth, gatePermission } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { prisma } from "@/lib/db";
import { UsersList } from "./users-list";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await gatePermission("users.view");
  // Pre-compute UI-gating flags on the server so the client component can
  // render conditional menus / buttons synchronously.
  const viewerId = session.user.id;
  const [viewerCanChangeRole, viewerCanDelete, viewerCanManageAssignments] =
    await Promise.all([
      can(viewerId, "users.change_role"),
      can(viewerId, "users.delete"),
      can(viewerId, "permissions.manage_assignments"),
    ]);
  const viewerIsOwner = session.user.role === "OWNER";

  const [users, activeRows, roleCounts, bulkAssignableRoles] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { workspaceUsers: true } },
        workspaceUsers: {
          select: {
            workspace: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.oidcModel.findMany({
      where: {
        model: "AccessToken",
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      select: { payload: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    // Roles offered by the bulk-assign picker. System roles only (workspace-
    // scoped + custom roles need the per-user UI for context).
    prisma.role.findMany({
      where: { isSystem: true },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  // Active = at least one unexpired OAuth AccessToken whose accountId matches.
  // Tokens default to a 60-minute TTL (see lib/oidc/provider.ts:45), so this
  // means "connected within the last hour."
  const activeAccountIds = new Set<string>();
  for (const r of activeRows) {
    const aid = (r.payload as { accountId?: string } | null)?.accountId;
    if (aid) activeAccountIds.add(aid);
  }

  const viewerRole = session.user.role ?? "USER";
  return (
    <UsersList
      viewerRole={viewerRole}
      viewerId={viewerId}
      viewerIsOwner={viewerIsOwner}
      viewerCanChangeRole={viewerCanChangeRole}
      viewerCanDelete={viewerCanDelete}
      viewerCanManageAssignments={viewerCanManageAssignments}
      bulkAssignableRoles={bulkAssignableRoles}
      roleCounts={Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]))}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        workspaceCount: u._count.workspaceUsers,
        workspaceNames: u.workspaceUsers.map((w) => w.workspace.name),
        mcpStatus: activeAccountIds.has(u.id) ? "active" : "inactive",
        suspended: !!u.suspendedAt,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
