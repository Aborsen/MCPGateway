import { gatePermission } from "@/lib/auth";
import {
  can,
  isOwnerUser,
  primarySystemRolesByUserId,
  primarySystemRoleFor,
} from "@/lib/permissions/resolve";
import { prisma } from "@/lib/db";
import { UsersList } from "./users-list";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await gatePermission("users.view");
  // Pre-compute UI-gating flags on the server so the client component can
  // render conditional menus / buttons synchronously.
  const viewerId = session.user.id;
  const [
    viewerCanChangeRole,
    viewerCanDelete,
    viewerCanManageAssignments,
    viewerIsOwner,
    viewerRole,
  ] = await Promise.all([
    can(viewerId, "users.change_role"),
    can(viewerId, "users.delete"),
    can(viewerId, "permissions.manage_assignments"),
    isOwnerUser(viewerId),
    primarySystemRoleFor(viewerId),
  ]);

  const [users, activeRows, bulkAssignableRoles, allAssignments] = await Promise.all([
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
    // Bulk-assign picker now shows every role (system + custom).
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, isSystem: true },
    }),
    // All role assignments — used to show every role each user holds on
    // the list (primary badge + "+N more" with a tooltip).
    prisma.userRole.findMany({
      include: {
        role: { select: { slug: true, name: true, isSystem: true } },
        workspace: { select: { name: true } },
      },
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

  // Resolve each user's primary system role from the UserRole table in one
  // batched query (PR2b dropped User.role).
  const roleByUserId = await primarySystemRolesByUserId(users.map((u) => u.id));
  const roleCounts: Record<string, number> = {};
  for (const u of users) {
    const slug = roleByUserId.get(u.id) ?? "USER";
    roleCounts[slug] = (roleCounts[slug] ?? 0) + 1;
  }

  // Group every UserRole assignment by user so the list can render the
  // primary badge + "+N more" with a tooltip of every name.
  const additionalByUserId = new Map<string, { name: string; isSystem: boolean; workspaceName: string | null }[]>();
  for (const a of allAssignments) {
    const arr = additionalByUserId.get(a.userId) ?? [];
    arr.push({
      name: a.role.name,
      isSystem: a.role.isSystem,
      workspaceName: a.workspace?.name ?? null,
    });
    additionalByUserId.set(a.userId, arr);
  }

  return (
    <UsersList
      viewerRole={viewerRole}
      viewerId={viewerId}
      viewerIsOwner={viewerIsOwner}
      viewerCanChangeRole={viewerCanChangeRole}
      viewerCanDelete={viewerCanDelete}
      viewerCanManageAssignments={viewerCanManageAssignments}
      bulkAssignableRoles={bulkAssignableRoles}
      roleCounts={roleCounts}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: roleByUserId.get(u.id) ?? "USER",
        allRoles: additionalByUserId.get(u.id) ?? [],
        workspaceCount: u._count.workspaceUsers,
        workspaceNames: u.workspaceUsers.map((w) => w.workspace.name),
        mcpStatus: activeAccountIds.has(u.id) ? "active" : "inactive",
        suspended: !!u.suspendedAt,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
