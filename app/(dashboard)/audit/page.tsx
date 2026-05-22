import { prisma } from "@/lib/db";
import { gateView } from "@/lib/auth";
import { AuditView } from "./audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await gateView("audit");
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

  return <AuditView users={users} dataSources={dataSources} />;
}
