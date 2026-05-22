import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { gatePermission } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePermissions, parseAllowedTables } from "@/lib/json";
import { WorkspaceEditor } from "./workspace-editor";
import { WorkspaceMcpUrl } from "./workspace-mcp-url";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function WorkspaceDetailPage({ params }: PageProps) {
  await gatePermission("workspaces.view");
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
        description={workspace.description ?? "Workspace details"}
        actions={
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to workspaces
          </Link>
        }
      />

      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Workspace MCP URL</CardTitle>
            <CardDescription>
              One URL for every member of this workspace. Each member signs in with their own
              credentials via OAuth; permissions are this workspace&apos;s grants only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceMcpUrl workspaceId={workspace.id} initialMcpUid={workspace.mcpUid} />
          </CardContent>
        </Card>

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
