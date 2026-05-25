import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { accessibleWorkspaceIds } from "@/lib/permissions/resolve";
import { WorkspacesList } from "./workspaces-list";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  // Don't use gatePermission("workspaces.view") — that checks global only,
  // and would 404 workspace_admins who have scoped access. Instead:
  // ensure we have a session, then filter the list by accessible scope.
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await accessibleWorkspaceIds(session.user.id);

  // Nothing accessible AND no global view → 404. Scoped users with empty
  // sets land here only if all their workspaces were deleted; treat as
  // "nothing to see" rather than letting them stare at an empty page.
  if (!access.all && access.ids.size === 0) {
    notFound();
  }

  const workspaces = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      ...(access.all ? {} : { id: { in: Array.from(access.ids) } }),
    },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { dataSources: true, users: true } },
    },
  });
  return (
    <WorkspacesList
      initial={workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        dataSourceCount: w._count.dataSources,
        userCount: w._count.users,
        createdAt: w.createdAt.toISOString(),
      }))}
    />
  );
}
