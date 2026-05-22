import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth, gateView } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePermissions } from "@/lib/json";
import { UserMcpUrl } from "./user-mcp-url";
import { UserAccountCard } from "./user-account-card";
import { UserWorkspacesCard } from "./user-workspaces-card";
import { UserInfoCard } from "./user-info-card";
import { UserActivityCard } from "./user-activity-card";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: PageProps) {
  await gateView("users");
  const { id } = await params;
  const session = await auth();
  const viewerRole = session?.user?.role ?? "USER";

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

  const since24h = new Date(Date.now() - 86400_000);
  const since7d = new Date(Date.now() - 7 * 86400_000);

  const [c24, c7, errors7, lastAudit, lastLogin, topTools, recent] = await Promise.all([
    prisma.auditLog.count({ where: { userId: id, createdAt: { gte: since24h } } }),
    prisma.auditLog.count({ where: { userId: id, createdAt: { gte: since7d } } }),
    prisma.auditLog.count({
      where: { userId: id, createdAt: { gte: since7d }, status: "ERROR" },
    }),
    prisma.auditLog.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.adminEvent.findFirst({
      where: { eventType: "USER_LOGIN", actorId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.auditLog.groupBy({
      by: ["toolName"],
      where: { userId: id, toolName: { not: null }, createdAt: { gte: since7d } },
      _count: { toolName: true },
      orderBy: { _count: { toolName: "desc" } },
      take: 5,
    }),
    prisma.auditLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        method: true,
        toolName: true,
        status: true,
        durationMs: true,
        createdAt: true,
        errorMessage: true,
      },
    }),
  ]);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const mcpUrl = `${proto}://${host}/api/mcp`;

  const workspaces = user.workspaceUsers.map((wu) => ({
    membershipId: wu.id,
    workspaceId: wu.workspaceId,
    workspaceName: wu.workspace.name,
    permissions: parsePermissions(wu.permissions),
    connectors: wu.workspace.dataSources.map((wds) => ({
      id: wds.id,
      name: wds.dataSource.name,
      slug: wds.dataSource.slug,
    })),
  }));

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
        <UserAccountCard
          userId={user.id}
          email={user.email}
          role={user.role}
          createdAt={user.createdAt.toISOString()}
          suspended={!!user.suspendedAt}
          viewerRole={viewerRole}
          isSelf={session?.user?.id === user.id}
        />

        <UserInfoCard
          queries24h={c24}
          queries7d={c7}
          errors7d={errors7}
          lastAuditAt={lastAudit?.createdAt.toISOString() ?? null}
          lastLoginAt={lastLogin?.createdAt.toISOString() ?? null}
          topTools={topTools.map((t) => ({
            name: t.toolName ?? "(unknown)",
            count: t._count.toolName,
          }))}
        />

        <UserWorkspacesCard userId={user.id} workspaces={workspaces} viewerRole={viewerRole} />

        <Card>
          <CardHeader>
            <CardTitle>MCP connection URL</CardTitle>
            <CardDescription>
              Paste this URL into Claude Code&apos;s{" "}
              <span className="font-mono text-xs">.mcp.json</span>. Every user shares the same URL —
              OAuth on first connect determines whose permissions apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserMcpUrl url={mcpUrl} />
          </CardContent>
        </Card>

        <UserActivityCard rows={recent.map((r) => ({
          id: r.id,
          method: r.method,
          toolName: r.toolName,
          status: r.status,
          durationMs: r.durationMs,
          createdAt: r.createdAt.toISOString(),
          errorMessage: r.errorMessage,
        }))} />
      </div>
    </>
  );
}
