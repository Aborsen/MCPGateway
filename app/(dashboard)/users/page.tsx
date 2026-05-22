import { auth, gateView } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersList } from "./users-list";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await gateView("users");
  const [session, users, activeRows, roleCounts] = await Promise.all([
    auth(),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { workspaceUsers: true } },
        workspaceUsers: {
          select: {
            workspace: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.oidcModel.findMany({
      where: {
        model: "AccessToken",
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      select: { payload: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  // Active = at least one unexpired OAuth AccessToken whose accountId matches.
  // Tokens default to a 60-minute TTL (see lib/oidc/provider.ts:45), so this
  // means "connected within the last hour."
  const activeAccountIds = new Set<string>();
  for (const r of activeRows) {
    const aid = (r.payload as { accountId?: string } | null)?.accountId;
    if (aid) activeAccountIds.add(aid);
  }

  const viewerRole = session?.user?.role ?? "USER";
  return (
    <UsersList
      viewerRole={viewerRole}
      viewerId={session?.user?.id ?? ""}
      roleCounts={Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]))}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        workspaceCount: u._count.workspaceUsers,
        workspaceNames: u.workspaceUsers.map((w) => w.workspace.name),
        mcpStatus: activeAccountIds.has(u.id) ? "active" : "inactive",
        suspended: !!u.suspendedAt,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
