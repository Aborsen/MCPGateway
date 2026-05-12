import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layouts/page-header";
import { parsePermissions, parseAllowedTables } from "@/lib/json";
import { WorkspaceEditor } from "./workspace-editor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [workspace, allDataSources, allUsers] = await Promise.all([
    prisma.workspace.findFirst({
      where: { id, deletedAt: null },
      include: {
        dataSources: { include: { dataSource: true } },
        users: { include: { user: true } },
      },
    }),
    prisma.dataSource.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  if (!workspace) notFound();

  return (
    <>
      <PageHeader
        title={workspace.name}
        description={workspace.description ?? "Team details"}
        actions={
          <Link
            href="/teams"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to teams
          </Link>
        }
      />

      <div className="p-6">
        <WorkspaceEditor
          workspace={{
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            dataSources: workspace.dataSources.map((wds) => ({
              dataSourceId: wds.dataSourceId,
              allowedTables: parseAllowedTables(wds.allowedTables),
            })),
            users: workspace.users.map((wu) => ({
              userId: wu.userId,
              permissions: parsePermissions(wu.permissions),
            })),
          }}
          allDataSources={allDataSources.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
          }))}
          allUsers={allUsers.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }))}
        />
      </div>
    </>
  );
}
