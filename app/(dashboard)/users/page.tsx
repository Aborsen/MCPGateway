import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersList } from "./users-list";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [session, users] = await Promise.all([
    auth(),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { workspaceUsers: true } },
      },
    }),
  ]);
  const viewerRole = session?.user?.role ?? "USER";
  return (
    <UsersList
      viewerRole={viewerRole}
      viewerId={session?.user?.id ?? ""}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        workspaceCount: u._count.workspaceUsers,
        hasMcpUrl: !!u.mcpUid,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
