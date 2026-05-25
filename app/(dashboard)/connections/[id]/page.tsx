import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { gatePermission, auth } from "@/lib/auth";
import { can } from "@/lib/permissions/resolve";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseAllowedTables, parsePermissions } from "@/lib/json";
import { ToolsEditor } from "./tools-editor";
import { UsedByCard } from "./used-by-card";
import { TablesViewer } from "@/components/tables-viewer";
import { BlockedTablesEditor } from "./blocked-tables-editor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConnectionDetailPage({ params }: PageProps) {
  await gatePermission("connections.view");
  const { id } = await params;
  const session = await auth();
  const canEditConnection = session?.user
    ? await can(session.user.id, "connections.update")
    : false;
  const ds = await prisma.dataSource.findUnique({
    where: { id },
    include: {
      workspaceDataSources: {
        // Hide soft-deleted workspaces from this view.
        where: { workspace: { deletedAt: null } },
        include: {
          workspace: {
            include: {
              // Workspace members feed the effective-users aggregate.
              // Filter to non-deleted users so removed accounts don't linger.
              users: {
                where: { user: { deletedAt: null } },
                include: { user: true },
              },
            },
          },
        },
      },
      directGrants: {
        where: { user: { deletedAt: null } },
        include: { user: true },
      },
    },
  });
  if (!ds) notFound();

  const workspaces = ds.workspaceDataSources.map((wds) => {
    const tables = parseAllowedTables(wds.allowedTables);
    return {
      id: wds.id,
      workspaceId: wds.workspaceId,
      workspaceName: wds.workspace.name,
      memberCount: wds.workspace.users.length,
      allowedTablesLabel: tables ? `Tables: ${tables.join(", ")}` : "All tables",
    };
  });

  // Aggregate every user who can reach this connector. Each user appears
  // once with one source entry per path that grants them access:
  //   - Workspace membership (with the SQL-level perms set on WorkspaceUser)
  //   - Direct grant (UserDataSourceAccess)
  // The UI annotates each row with its sources so the "why does X have
  // access?" question is answerable at a glance.
  type UserSource = {
    kind: "workspace" | "direct";
    workspaceId?: string;
    workspaceName?: string;
    permissions: string[];
    allowedTablesLabel: string | null;
  };
  type UserEntry = {
    userId: string;
    userName: string;
    userEmail: string;
    sources: UserSource[];
  };
  const userMap = new Map<string, UserEntry>();
  for (const wds of ds.workspaceDataSources) {
    for (const wu of wds.workspace.users) {
      const entry = userMap.get(wu.userId) ?? {
        userId: wu.userId,
        userName: wu.user.name,
        userEmail: wu.user.email,
        sources: [],
      };
      const tables = parseAllowedTables(wds.allowedTables);
      entry.sources.push({
        kind: "workspace",
        workspaceId: wds.workspaceId,
        workspaceName: wds.workspace.name,
        permissions: parsePermissions(wu.permissions),
        allowedTablesLabel: tables ? `Tables: ${tables.join(", ")}` : null,
      });
      userMap.set(wu.userId, entry);
    }
  }
  for (const g of ds.directGrants) {
    const entry = userMap.get(g.userId) ?? {
      userId: g.userId,
      userName: g.user.name,
      userEmail: g.user.email,
      sources: [],
    };
    const tables = parseAllowedTables(g.allowedTables);
    entry.sources.push({
      kind: "direct",
      permissions: parsePermissions(g.permissions),
      allowedTablesLabel: tables ? `Tables: ${tables.join(", ")}` : null,
    });
    userMap.set(g.userId, entry);
  }
  const users = Array.from(userMap.values()).sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );
  const directGrantCount = ds.directGrants.length;

  return (
    <>
      <PageHeader
        title={ds.name}
        description={ds.description ?? `Upstream MCP server (${ds.type})`}
        actions={
          <Link
            href="/connections"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Type" value={ds.type} />
            <DetailRow
              label="Upstream"
              value={
                <a
                  href={ds.upstreamUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary"
                >
                  {ds.upstreamUrl.length > 40 ? `${ds.upstreamUrl.slice(0, 40)}…` : ds.upstreamUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
            />
            <DetailRow label="Encrypted creds" value={ds.configEncrypted ? "Set" : "None"} />
            <div className="border-t border-border pt-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Tool prefix
              </div>
              <code className="mt-1 block break-all font-mono text-xs">
                {ds.slug}__<span className="text-muted-foreground">tool_name</span>
              </code>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Tools appear in Claude with this prefix so calls route back to this connection.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Tools</CardTitle>
                <CardDescription>
                  Discovered live from the upstream. Levels are auto-classified; click a dropdown to override.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <TablesViewer dataSourceId={ds.id} dataSourceName={ds.name} />
                {canEditConnection && (
                  <BlockedTablesEditor
                    dataSourceId={ds.id}
                    dataSourceName={ds.name}
                    initialBlocked={parseAllowedTables(ds.blockedTables) ?? []}
                  />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ToolsEditor dataSourceId={ds.id} />
          </CardContent>
        </Card>

        <UsedByCard
          dataSourceId={ds.id}
          workspaces={workspaces}
          users={users}
          directGrantCount={directGrantCount}
          canManageDirectGrants={canEditConnection}
        />
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
