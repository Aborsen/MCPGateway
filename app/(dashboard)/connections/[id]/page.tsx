import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolsEditor } from "./tools-editor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConnectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ds = await prisma.dataSource.findUnique({
    where: { id },
    include: {
      workspaceDataSources: { include: { workspace: true } },
      directGrants: { include: { user: true } },
    },
  });
  if (!ds) notFound();

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
            <DetailRow label="Slug" value={ds.slug} mono />
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
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>
              Discovered live from the upstream. Levels are auto-classified; click a dropdown to override.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToolsEditor dataSourceId={ds.id} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>
              Used by ({ds.workspaceDataSources.length} workspace{ds.workspaceDataSources.length === 1 ? "" : "s"}, {" "}
              {ds.directGrants.length} direct grant{ds.directGrants.length === 1 ? "" : "s"})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ds.workspaceDataSources.length === 0 && ds.directGrants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not used yet. Assign it via{" "}
                <Link href="/workspaces" className="text-primary hover:underline">
                  Workspaces
                </Link>{" "}
                or grant a user direct access via{" "}
                <Link href="/permissions" className="text-primary hover:underline">
                  Permissions
                </Link>
                .
              </p>
            ) : (
              <>
                {ds.workspaceDataSources.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Workspaces</div>
                    <ul className="space-y-2">
                      {ds.workspaceDataSources.map((wds) => (
                        <li key={wds.id} className="flex items-center justify-between rounded-md border border-border p-3">
                          <Link href={`/workspaces/${wds.workspaceId}`} className="font-medium hover:text-primary">
                            {wds.workspace.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {wds.allowedTables ? `Restricted: ${JSON.parse(wds.allowedTables).join(", ")}` : "All tables"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ds.directGrants.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Direct grants</div>
                    <ul className="space-y-2">
                      {ds.directGrants.map((g) => (
                        <li key={g.id} className="flex items-center justify-between rounded-md border border-border p-3">
                          <Link href={`/users/${g.userId}`} className="font-medium hover:text-primary">
                            {g.user.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {JSON.parse(g.permissions).join(", ")}
                            {g.allowedTables && ` · tables: ${JSON.parse(g.allowedTables).join(", ")}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
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
