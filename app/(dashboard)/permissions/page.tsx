import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layouts/page-header";
import { Badge } from "@/components/ui/badge";
import { parsePermissions } from "@/lib/json";
import type { PermissionLevel } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";

const LEVELS: PermissionLevel[] = ["read", "write", "delete"];

export default async function PermissionsPage() {
  const [users, dataSources, workspaceUsers] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.dataSource.findMany({ orderBy: { name: "asc" } }),
    prisma.workspaceUser.findMany({
      where: { workspace: { deletedAt: null } },
      include: {
        workspace: {
          include: { dataSources: true },
        },
      },
    }),
  ]);

  type Cell = { dsId: string; perms: Set<PermissionLevel> };
  const grid = new Map<string, Map<string, Set<PermissionLevel>>>();

  for (const wu of workspaceUsers) {
    const perms = parsePermissions(wu.permissions);
    let row = grid.get(wu.userId);
    if (!row) {
      row = new Map();
      grid.set(wu.userId, row);
    }
    for (const wds of wu.workspace.dataSources) {
      let cell = row.get(wds.dataSourceId);
      if (!cell) {
        cell = new Set();
        row.set(wds.dataSourceId, cell);
      }
      for (const p of perms) cell.add(p);
    }
  }

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Effective per-user × per-data-source permissions (rolled up across workspaces)."
      />
      <div className="p-6">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-medium">User</th>
                {dataSources.map((d) => (
                  <th key={d.id} className="px-4 py-3 text-left font-medium">
                    <Link href={`/connections/${d.id}`} className="hover:text-foreground">
                      {d.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const row = grid.get(u.id);
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-4 py-3">
                      <Link href={`/users/${u.id}`} className="font-medium hover:text-primary">
                        {u.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    {dataSources.map((d) => {
                      const perms = row?.get(d.id);
                      const hasAny = perms && perms.size > 0;
                      return (
                        <td key={d.id} className="px-4 py-3">
                          {hasAny ? (
                            <div className="flex gap-1">
                              {LEVELS.map((p) => (
                                <Badge
                                  key={p}
                                  variant={perms!.has(p) ? "success" : "outline"}
                                  className={
                                    perms!.has(p) ? "uppercase" : "uppercase opacity-30"
                                  }
                                >
                                  {perms!.has(p) ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Minus className="h-3 w-3" />
                                  )}
                                  {p[0]}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No access</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Edit permissions on the{" "}
          <Link href="/workspaces" className="text-primary hover:underline">
            Workspaces
          </Link>{" "}
          page — assignments roll up here automatically.
        </p>
      </div>
    </>
  );
}
