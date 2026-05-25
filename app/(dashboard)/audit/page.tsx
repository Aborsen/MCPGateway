import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { AuditView } from "./audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  // Either audit.view_own or audit.view_all lands on the page; the APIs
  // do the actual filtering by scope. Users with neither get a 404.
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [viewOwn, viewAll, viewAdminEvents] = await Promise.all([
    can(session.user.id, "audit.view_own"),
    can(session.user.id, "audit.view_all"),
    can(session.user.id, "audit.view_admin_events"),
  ]);
  if (!viewOwn && !viewAll) notFound();

  // view_own users only need themselves in the filter dropdowns; view_all
  // users see everyone. Same logic for data sources.
  const [users, dataSources] = await Promise.all([
    viewAll
      ? prisma.user.findMany({
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        })
      : prisma.user
          .findUnique({
            where: { id: session.user.id },
            select: { id: true, name: true, email: true },
          })
          .then((u) => (u ? [u] : [])),
    prisma.dataSource.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <AuditView
      users={users}
      dataSources={dataSources}
      viewAll={viewAll}
      viewAdminEvents={viewAdminEvents}
    />
  );
}
