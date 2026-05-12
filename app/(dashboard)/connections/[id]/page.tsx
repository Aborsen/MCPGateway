import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layouts/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConnectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ds = await prisma.dataSource.findUnique({
    where: { id },
    include: {
      toolPermissions: { orderBy: [{ level: "asc" }, { toolName: "asc" }] },
      workspaceDataSources: { include: { workspace: true } },
    },
  });
  if (!ds) notFound();

  const grouped = {
    READ: ds.toolPermissions.filter((t) => t.level === "READ"),
    WRITE: ds.toolPermissions.filter((t) => t.level === "WRITE"),
    DELETE: ds.toolPermissions.filter((t) => t.level === "DELETE"),
  };

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
            <CardTitle>Tools ({ds.toolPermissions.length})</CardTitle>
            <CardDescription>
              Pre-classified by permission level. Unknown tools default to <code>write</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(["READ", "WRITE", "DELETE"] as const).map((level) => (
                <div key={level}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={level === "DELETE" ? "destructive" : level === "WRITE" ? "default" : "success"}>
                      {level}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {grouped[level].length} tool{grouped[level].length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {grouped[level].map((t) => (
                      <code
                        key={t.id}
                        className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
                      >
                        {t.toolName}
                      </code>
                    ))}
                    {grouped[level].length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Workspaces using this connection ({ds.workspaceDataSources.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {ds.workspaceDataSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not used in any workspace yet. Assign it via the{" "}
                <Link href="/workspaces" className="text-primary hover:underline">
                  Workspaces
                </Link>{" "}
                page.
              </p>
            ) : (
              <ul className="space-y-2">
                {ds.workspaceDataSources.map((wds) => (
                  <li key={wds.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <Link
                      href={`/workspaces/${wds.workspaceId}`}
                      className="font-medium hover:text-primary"
                    >
                      {wds.workspace.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {wds.allowedTables ? `Restricted: ${JSON.parse(wds.allowedTables).join(", ")}` : "All tables"}
                    </span>
                  </li>
                ))}
              </ul>
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
