import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { gatePermission } from "@/lib/auth";
import { can, isOwnerUser } from "@/lib/permissions/resolve";
import { PERMISSION_ENTRIES } from "@/lib/permissions/catalog";
import { PageHeader } from "@/components/layouts/page-header";
import { parsePermissions } from "@/lib/json";
import { UserAccountCard } from "./user-account-card";
import { UserWorkspacesCard } from "./user-workspaces-card";
import {
  UserConnectionsCard,
  type ConnectionAccess,
} from "./user-connections-card";
import { UserInfoCard } from "./user-info-card";
import {
  AssignedRolesCard,
  PermissionOverridesCard,
  EffectivePermissionsCard,
  type EffectivePermission,
} from "./access/user-access-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: PageProps) {
  const session = await gatePermission("users.view");
  const { id } = await params;
  const viewerId = session.user.id;
  const viewerIsOwner = await isOwnerUser(viewerId);

  // Per-action UI flags — computed once on the server, passed into the
  // client cards. They use these to enable/disable the inline editors,
  // the remove-from-workspace buttons, and the access controls.
  const [
    viewerCanSuspend,
    viewerCanRemoveMembership,
    viewerCanManageAssignments,
    viewerCanManageOverrides,
  ] = await Promise.all([
    can(viewerId, "users.suspend"),
    // Removing this user from a workspace requires workspaces.manage_members.
    can(viewerId, "workspaces.manage_members"),
    can(viewerId, "permissions.manage_assignments"),
    can(viewerId, "permissions.manage_overrides"),
  ]);

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      workspaceUsers: {
        include: {
          workspace: {
            include: {
              dataSources: { include: { dataSource: true } },
            },
          },
        },
      },
      // Direct grants (UserDataSourceAccess) feed the Connections card
      // alongside workspace-derived access.
      directGrants: {
        include: { dataSource: true },
      },
    },
  });
  if (!user) notFound();

  const since24h = new Date(Date.now() - 86400_000);
  const since7d = new Date(Date.now() - 7 * 86400_000);

  // Stats + access data fetched in parallel. The access bundle (assignments,
  // overrides, role catalog, workspaces, role permission map) lives inline
  // on this page now instead of on a separate /access route.
  const [
    c24,
    c7,
    errors7,
    lastAudit,
    lastLogin,
    topTools,
    allRoles,
    allWorkspaces,
    assignments,
    overrides,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { userId: id, createdAt: { gte: since24h } } }),
    prisma.auditLog.count({ where: { userId: id, createdAt: { gte: since7d } } }),
    prisma.auditLog.count({
      where: { userId: id, createdAt: { gte: since7d }, status: "ERROR" },
    }),
    prisma.auditLog.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.adminEvent.findFirst({
      where: { eventType: "USER_LOGIN", actorId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.auditLog.groupBy({
      by: ["toolName"],
      where: { userId: id, toolName: { not: null }, createdAt: { gte: since7d } },
      _count: { toolName: true },
      orderBy: { _count: { toolName: "desc" } },
      take: 5,
    }),
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, isSystem: true },
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.userRole.findMany({
      where: { userId: id },
      include: {
        role: { select: { id: true, slug: true, name: true, isSystem: true } },
        workspace: { select: { id: true, name: true } },
        grantedBy: { select: { name: true, email: true } },
      },
      orderBy: { grantedAt: "asc" },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId: id },
      include: {
        workspace: { select: { id: true, name: true } },
        grantedBy: { select: { name: true, email: true } },
      },
      orderBy: { grantedAt: "desc" },
    }),
  ]);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const mcpUrl = `${proto}://${host}/api/mcp`;

  const workspaces = user.workspaceUsers.map((wu) => ({
    membershipId: wu.id,
    workspaceId: wu.workspaceId,
    workspaceName: wu.workspace.name,
    permissions: parsePermissions(wu.permissions),
  }));

  // Deduplicated connections aggregate. A connector appears once per
  // user, with one source entry per path that grants access (each
  // WorkspaceUser whose workspace includes it, plus any direct grant).
  const connectionsByDsId = new Map<string, ConnectionAccess>();
  for (const wu of user.workspaceUsers) {
    const wsPerms = parsePermissions(wu.permissions);
    for (const wds of wu.workspace.dataSources) {
      const ds = wds.dataSource;
      const entry = connectionsByDsId.get(ds.id) ?? {
        dataSourceId: ds.id,
        dataSourceName: ds.name,
        dataSourceType: ds.type,
        sources: [],
      };
      entry.sources.push({
        kind: "workspace",
        workspaceId: wu.workspaceId,
        workspaceName: wu.workspace.name,
        permissions: wsPerms,
      });
      connectionsByDsId.set(ds.id, entry);
    }
  }
  for (const dg of user.directGrants) {
    const ds = dg.dataSource;
    const entry = connectionsByDsId.get(ds.id) ?? {
      dataSourceId: ds.id,
      dataSourceName: ds.name,
      dataSourceType: ds.type,
      sources: [],
    };
    entry.sources.push({
      kind: "direct",
      permissions: parsePermissions(dg.permissions),
    });
    connectionsByDsId.set(ds.id, entry);
  }
  const connections = Array.from(connectionsByDsId.values()).sort((a, b) =>
    a.dataSourceName.localeCompare(b.dataSourceName),
  );

  // Compute effective permissions with provenance. Mirrors the logic in
  // app/api/users/[id]/effective-permissions/route.ts but kept inline so
  // the page renders in one round trip.
  const now = new Date();
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: { in: assignments.map((a) => a.roleId) } },
    select: { roleId: true, permissionKey: true },
  });
  const permsByRole = new Map<string, string[]>();
  for (const rp of rolePerms) {
    const arr = permsByRole.get(rp.roleId) ?? [];
    arr.push(rp.permissionKey);
    permsByRole.set(rp.roleId, arr);
  }

  type Prov = {
    grantedBy: { roleName: string; workspaceName: string | null }[];
    overriddenBy: EffectivePermission["overriddenBy"];
    has: boolean;
  };
  const byKey = new Map<string, Prov>();
  for (const p of PERMISSION_ENTRIES) {
    byKey.set(p.key, { grantedBy: [], overriddenBy: null, has: false });
  }
  for (const a of assignments) {
    for (const key of permsByRole.get(a.roleId) ?? []) {
      const p = byKey.get(key);
      if (!p) continue;
      p.grantedBy.push({
        roleName: a.role.name,
        workspaceName: a.workspace?.name ?? null,
      });
      p.has = true;
    }
  }
  // Apply overrides chronologically (oldest → newest) so last-write wins.
  for (let i = overrides.length - 1; i >= 0; i--) {
    const o = overrides[i];
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p) continue;
    if (o.effect === "GRANT") p.has = true;
    else if (o.effect === "REVOKE") p.has = false;
  }
  // Attribute "overriddenBy" to the most-recent active override per key.
  for (const o of overrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p || p.overriddenBy) continue;
    p.overriddenBy = {
      id: o.id,
      effect: o.effect as "GRANT" | "REVOKE",
      reason: o.reason,
      workspaceName: o.workspace?.name ?? null,
      expiresAt: o.expiresAt?.toISOString() ?? null,
    };
  }

  const effective: EffectivePermission[] = PERMISSION_ENTRIES.map((p) => ({
    key: p.key,
    label: p.label,
    category: p.category,
    description: p.description,
    ...(byKey.get(p.key) as Prov),
  }));

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <Link
            href="/users"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to users
          </Link>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <UserAccountCard
          userId={user.id}
          email={user.email}
          createdAt={user.createdAt.toISOString()}
          suspended={!!user.suspendedAt}
          mcpUrl={mcpUrl}
          viewerIsOwner={viewerIsOwner}
          viewerCanSuspend={viewerCanSuspend}
          isSelf={viewerId === user.id}
        />

        <UserInfoCard
          queries24h={c24}
          queries7d={c7}
          errors7d={errors7}
          lastAuditAt={lastAudit?.createdAt.toISOString() ?? null}
          lastLoginAt={lastLogin?.createdAt.toISOString() ?? null}
          topTools={topTools.map((t) => ({
            name: t.toolName ?? "(unknown)",
            count: t._count.toolName,
          }))}
        />

        <AssignedRolesCard
          userId={user.id}
          canManage={viewerCanManageAssignments}
          assignments={assignments.map((a) => ({
            id: a.id,
            roleId: a.roleId,
            roleSlug: a.role.slug,
            roleName: a.role.name,
            isSystemRole: a.role.isSystem,
            workspaceId: a.workspaceId,
            workspaceName: a.workspace?.name ?? null,
            grantedByName: a.grantedBy?.name ?? null,
            grantedAt: a.grantedAt.toISOString(),
          }))}
          roles={allRoles}
          workspaces={allWorkspaces}
        />

        <PermissionOverridesCard
          userId={user.id}
          canManage={viewerCanManageOverrides}
          overrides={overrides
            .filter((o) => !o.expiresAt || o.expiresAt > now)
            .map((o) => ({
              id: o.id,
              permissionKey: o.permissionKey,
              effect: o.effect as "GRANT" | "REVOKE",
              reason: o.reason,
              workspaceId: o.workspaceId,
              workspaceName: o.workspace?.name ?? null,
              grantedByName: o.grantedBy?.name ?? null,
              grantedAt: o.grantedAt.toISOString(),
              expiresAt: o.expiresAt?.toISOString() ?? null,
            }))}
          workspaces={allWorkspaces}
          catalog={[...PERMISSION_ENTRIES].map((p) => ({
            key: p.key,
            label: p.label,
            category: p.category,
            scopeable: p.scopeable,
          }))}
        />

        <UserWorkspacesCard
          userId={user.id}
          workspaces={workspaces}
          canRemove={viewerCanRemoveMembership}
        />

        <UserConnectionsCard connections={connections} />

        <EffectivePermissionsCard effective={effective} className="lg:col-span-2" />
      </div>
    </>
  );
}
