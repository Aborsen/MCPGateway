import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { gatePermission, auth } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { PageHeader } from "@/components/layouts/page-header";
import { PERMISSION_ENTRIES } from "@/lib/permissions/catalog";
import { UserAccessView } from "./user-access-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserAccessPage({ params }: PageProps) {
  await gatePermission("permissions.view");
  const { id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? "";

  // Per-action UI flags. The page itself is gated by permissions.view, but
  // individual mutations need finer-grained checks. Compute once on the
  // server, pass to client.
  const [canManageAssignments, canManageOverrides] = await Promise.all([
    can(viewerId, "permissions.manage_assignments"),
    can(viewerId, "permissions.manage_overrides"),
  ]);

  const [user, allRoles, allWorkspaces, assignments, overrides] = await Promise.all([
    prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
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

  if (!user) notFound();

  // Compute effective permissions + provenance server-side so the panel
  // renders without a client roundtrip.
  const now = new Date();
  type Prov = {
    grantedBy: { roleName: string; workspaceName: string | null }[];
    overriddenBy: {
      id: string;
      effect: "GRANT" | "REVOKE";
      reason: string | null;
      workspaceName: string | null;
      expiresAt: string | null;
    } | null;
    has: boolean;
  };
  const byKey = new Map<string, Prov>();
  for (const p of PERMISSION_ENTRIES) {
    byKey.set(p.key, { grantedBy: [], overriddenBy: null, has: false });
  }

  // Need to fetch role permissions for accurate provenance.
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
  // Apply overrides oldest → newest so last-write wins.
  for (let i = overrides.length - 1; i >= 0; i--) {
    const o = overrides[i];
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p) continue;
    if (!p.overriddenBy) {
      p.overriddenBy = {
        id: o.id,
        effect: o.effect as "GRANT" | "REVOKE",
        reason: o.reason,
        workspaceName: o.workspace?.name ?? null,
        expiresAt: o.expiresAt?.toISOString() ?? null,
      };
    }
    if (o.effect === "GRANT") p.has = true;
    else if (o.effect === "REVOKE") p.has = false;
  }
  // After the chronological pass, set overriddenBy to the most-recent
  // override (first one in the overrides array, which is newest-first).
  for (const o of overrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p) continue;
    p.overriddenBy = {
      id: o.id,
      effect: o.effect as "GRANT" | "REVOKE",
      reason: o.reason,
      workspaceName: o.workspace?.name ?? null,
      expiresAt: o.expiresAt?.toISOString() ?? null,
    };
    // Only set the first (newest) one; break out of inner loop by using a flag.
    break;
  }

  const effective = PERMISSION_ENTRIES.map((p) => ({
    key: p.key,
    label: p.label,
    category: p.category,
    description: p.description,
    ...(byKey.get(p.key) as Prov),
  }));

  return (
    <>
      <PageHeader
        title={`${user.name} · Access`}
        description={user.email}
        actions={
          <Link
            href={`/users/${user.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to user
          </Link>
        }
      />
      <UserAccessView
        userId={user.id}
        canManageAssignments={canManageAssignments}
        canManageOverrides={canManageOverrides}
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
        effective={effective}
        roles={allRoles}
        workspaces={allWorkspaces}
        catalog={[...PERMISSION_ENTRIES].map((p) => ({
          key: p.key,
          label: p.label,
          category: p.category,
          scopeable: p.scopeable,
        }))}
      />
    </>
  );
}
