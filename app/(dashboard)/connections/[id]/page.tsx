import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { gatePermission } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseAllowedTables, parsePermissions } from "@/lib/json";
import { ToolsEditor } from "./tools-editor";
import { UsedByCard } from "./used-by-card";
import { TablesViewer } from "@/components/tables-viewer";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConnectionDetailPage({ params }: PageProps) {
  await gatePermission("connections.view");
  const { id } = await params;
  const ds = await prisma.dataSource.findUnique({
    where: { id },
    include: {
      workspaceDataSources: { include: { workspace: true } },
      directGrants: { include: { user: true } },
    },
  });
  if (!ds) notFound();

  const workspaces = ds.workspaceDataSources.map((wds) => {
    const tables = parseAllowedTables(wds.allowedTables);
    return {
      id: wds.id,
      workspaceId: wds.workspaceId,
      workspaceName: wds.workspace.name,
      allowedTablesLabel: tables ? `Tables: ${tables.join(", ")}` : "All tables",
    };
  });

  const directGrants = ds.directGrants.map((g) => {
    const perms = parsePermissions(g.permissions);
    const tables = parseAllowedTables(g.allowedTables);
    return {
      id: g.id,
      userId: g.userId,
      userName: g.user.name,
      userEmail: g.user.email,
      permissionsLabel: perms.join(", "),
      allowedTablesLabel: tables ? `Tables: ${tables.join(", ")}` : null,
    };
  });

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
              <TablesViewer dataSourceId={ds.id} dataSourceName={ds.name} />
            </div>
          </CardHeader>
          <CardContent>
            <ToolsEditor dataSourceId={ds.id} />
          </CardContent>
        </Card>

        <UsedByCard workspaces={workspaces} directGrants={directGrants} />
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
