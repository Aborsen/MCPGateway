import { prisma } from "@/lib/db";
import { AuditLogView } from "./audit-log-view";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const [users, dataSources] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.dataSource.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return <AuditLogView users={users} dataSources={dataSources} />;
}
