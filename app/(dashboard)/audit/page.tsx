import { prisma } from "@/lib/db";
import { gatePermission } from "@/lib/auth";
import { AuditView } from "./audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  // PR2: gate on view_all. PR4 will split this so audit.view_own users
  // also reach the page but see a filtered view.
  await gatePermission("audit.view_all");
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
