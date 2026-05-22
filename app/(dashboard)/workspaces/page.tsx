import { prisma } from "@/lib/db";
import { gateView } from "@/lib/auth";
import { WorkspacesList } from "./workspaces-list";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  await gateView("workspaces");
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
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
