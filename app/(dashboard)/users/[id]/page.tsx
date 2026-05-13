import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layouts/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePermissions } from "@/lib/json";
import { UserMcpUrl } from "./user-tokens";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      workspaceUsers: {
        include: {
          workspace: {
            include: {
              dataSources: { include: { dataSource: true } },
            },
          },
        },
      },
    },
  });
  if (!user) notFound();

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <Link
            href="/users"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to users
          </Link>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Email, role, and account state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace assignments</CardTitle>
            <CardDescription>Workspaces this user can access via MCP.</CardDescription>
          </CardHeader>
          <CardContent>
            {user.workspaceUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not assigned to any workspaces yet.{" "}
                <Link href="/workspaces" className="text-primary hover:underline">
                  Go to workspaces
                </Link>{" "}
                to add this user.
              </p>
            ) : (
              <ul className="space-y-3">
                {user.workspaceUsers.map((wu) => {
                  const perms = parsePermissions(wu.permissions);
                  return (
                    <li key={wu.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/workspaces/${wu.workspaceId}`}
                          className="font-medium hover:text-primary"
                        >
                          {wu.workspace.name}
                        </Link>
                        <div className="flex gap-1">
                          {perms.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs uppercase">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {wu.workspace.dataSources.map((wds) => (
                          <Badge key={wds.id} variant="secondary" className="text-xs">
                            {wds.dataSource.name}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>MCP connection URL</CardTitle>
            <CardDescription>
              Paste this URL into Claude Code&apos;s{" "}
              <span className="font-mono text-xs">.mcp.json</span>. The user will sign in via OAuth
              on first connect — the URL itself is not a secret.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserMcpUrl userId={user.id} initialMcpUid={user.mcpUid} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
