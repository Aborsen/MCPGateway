import { prisma } from "@/lib/db";
import { gatePermission } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/page-header";
import { RolesView } from "./roles-view";
import { PERMISSION_ENTRIES } from "@/lib/permissions/catalog";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await gatePermission("permissions.view");
  const session = await auth();
  const canManage = session?.user
    ? await can(session.user.id, "permissions.manage_roles")
    : false;

  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      rolePermissions: { select: { permissionKey: true } },
      _count: { select: { assignments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Roles"
        description="Catalog of roles a user can be assigned. System roles are seeded and read-only; custom roles let you carve out org-specific access (e.g. 'Connection Creator only')."
      />
      <RolesView
        canManage={canManage}
        catalog={[...PERMISSION_ENTRIES].map((p) => ({
          key: p.key,
          label: p.label,
          category: p.category,
          description: p.description,
          scopeable: p.scopeable,
        }))}
        initial={roles.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          permissions: r.rolePermissions.map((rp) => rp.permissionKey),
          assignmentCount: r._count.assignments,
        }))}
      />
    </>
  );
}
