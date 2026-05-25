import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canInWorkspace, can } from "@/lib/permissions/resolve";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePermissions, parseAllowedTables } from "@/lib/json";
import { WorkspaceEditor } from "./workspace-editor";
import { WorkspaceMcpUrl } from "./workspace-mcp-url";
import { WorkspaceAdminsCard } from "./workspace-admins-card";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  // Scope-aware view gate: a workspace_admin scoped to this workspace
  // qualifies even without global workspaces.view.
  if (!(await canInWorkspace(session.user.id, "workspaces.view", id))) {
    notFound();
  }

  // Per-action UI flags for the new Workspace admins card.
  const canManageMembers = await canInWorkspace(
    session.user.id,
    "workspaces.manage_members",
    id,
  );
  const canViewUsers = await can(session.user.id, "users.view");

  const [workspace, allDataSources, allUsers, workspaceAdminRole, workspaceMemberRole, scopedAssignments] =
    await Promise.all([
      prisma.workspace.findFirst({
        where: { id, deletedAt: null },
        include: {
          dataSources: { include: { dataSource: true } },
          users: { include: { user: true } },
        },
      }),
      prisma.dataSource.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      // Resolve the system role IDs we need for the picker.
      prisma.role.findUnique({
        where: { slug: "workspace_admin" },
        select: { id: true },
      }),
      prisma.role.findUnique({
        where: { slug: "workspace_member" },
        select: { id: true },
      }),
      // All UserRole rows scoped to this workspace (admins + members).
      prisma.userRole.findMany({
        where: { workspaceId: id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, slug: true, name: true } },
          grantedBy: { select: { name: true } },
        },
        orderBy: { grantedAt: "asc" },
      }),
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

        <WorkspaceAdminsCard
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          canManage={canManageMembers}
          canViewUsers={canViewUsers}
          workspaceAdminRoleId={workspaceAdminRole?.id ?? null}
          workspaceMemberRoleId={workspaceMemberRole?.id ?? null}
          allUsers={allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
          assignments={scopedAssignments.map((a) => ({
            id: a.id,
            userId: a.userId,
            userName: a.user.name,
            userEmail: a.user.email,
            roleId: a.roleId,
            roleSlug: a.role.slug,
            roleName: a.role.name,
            grantedAt: a.grantedAt.toISOString(),
            grantedByName: a.grantedBy?.name ?? null,
          }))}
        />

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
