import { prisma } from "@/lib/db";
import { LogsView } from "./logs-view";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const [users, dataSources] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.dataSource.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return <LogsView users={users} dataSources={dataSources} />;
}
