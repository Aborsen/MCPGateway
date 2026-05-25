import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { accessibleWorkspaceIds, can, canInWorkspace } from "@/lib/permissions/resolve";
import { WorkspacesList } from "./workspaces-list";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  // Don't use gatePermission("workspaces.view") — that checks global only,
  // and would 404 workspace_admins who have scoped access. Instead:
  // ensure we have a session, then filter the list by accessible scope.
  const session = await auth();
  if (!session?.user) redirect("/login");
  const viewerId = session.user.id;
  const access = await accessibleWorkspaceIds(viewerId);

  // Nothing accessible AND no global view → 404. Scoped users with empty
  // sets land here only if all their workspaces were deleted; treat as
  // "nothing to see" rather than letting them stare at an empty page.
  if (!access.all && access.ids.size === 0) {
    notFound();
  }

  // Permission flags for the toolbar / row actions. workspaces.create is
  // global-only so a single can() resolves it; workspaces.delete is scopeable
  // and we let the server resolve per-row when the user hits bulk-delete.
  const viewerCanCreate = await can(viewerId, "workspaces.create");

  const workspaces = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      ...(access.all ? {} : { id: { in: Array.from(access.ids) } }),
    },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { dataSources: true, users: true } },
      users: {
        where: { user: { deletedAt: null } },
        include: { user: { select: { name: true } } },
        take: 5,
      },
    },
  });

  // Resolve workspaces.delete per-row so the row-level action can render
  // accurately (the bulk endpoint also re-checks; this is just for UX).
  const deletableSet = new Set<string>();
  for (const w of workspaces) {
    if (await canInWorkspace(viewerId, "workspaces.delete", w.id)) {
      deletableSet.add(w.id);
    }
  }

  return (
    <WorkspacesList
      initial={workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        dataSourceCount: w._count.dataSources,
        userCount: w._count.users,
        userNames: w.users.map((u) => u.user.name),
        createdAt: w.createdAt.toISOString(),
        canDelete: deletableSet.has(w.id),
      }))}
      viewerCanCreate={viewerCanCreate}
    />
  );
}
