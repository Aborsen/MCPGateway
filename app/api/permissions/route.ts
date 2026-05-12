import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getUserAccess } from "@/lib/mcp/permission-filter";

export async function GET() {
  await requireAdmin();
  const [users, dataSources] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.dataSource.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, type: true },
    }),
  ]);

  // For each user, compute effective access across all data sources.
  // getUserAccess returns only the data sources the user has *some* access to;
  // we keep the rest with empty grants so the matrix is rectangular.
  const grants = await Promise.all(
    users.map(async (u) => {
      const access = await getUserAccess(u.id);
      const byDsId = new Map(access.map((a) => [a.dataSourceId, a]));
      return dataSources.map((ds) => {
        const a = byDsId.get(ds.id);
        return {
          userId: u.id,
          dataSourceId: ds.id,
          permissions: a ? Array.from(a.permissions) : [],
          allowedTables: a?.allowedTables ?? null,
          sources: a?.sources ?? [],
        };
      });
    }),
  );

  return NextResponse.json({
    users,
    dataSources,
    grants: grants.flat(),
  });
}
