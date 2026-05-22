import { prisma } from "@/lib/db";
import { gateView } from "@/lib/auth";
import { ConnectionsList } from "./connections-list";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  await gateView("connections");
  const connections = await prisma.dataSource.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          toolPermissions: true,
          workspaceDataSources: true,
          directGrants: true,
        },
      },
    },
  });

  return (
    <ConnectionsList
      initial={connections.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        type: c.type,
        upstreamUrl: c.upstreamUrl,
        description: c.description,
        toolCount: c._count.toolPermissions,
        workspaceCount: c._count.workspaceDataSources,
        directGrantCount: c._count.directGrants,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
