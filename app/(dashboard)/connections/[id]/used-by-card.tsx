"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, FolderTree, User as UserIcon, ShieldCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EFFECTIVE_LEVEL_LABEL,
  effectiveLevelsFor,
  type PermissionLevel,
} from "@/app/(dashboard)/permissions/permissions-types";

export type WorkspaceEntry = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  memberCount: number;
};

export type UserSource = {
  kind: "workspace" | "direct";
  workspaceId?: string;
  workspaceName?: string;
  permissions: string[];
  allowedTablesLabel: string | null;
  allowedTables: string[] | null;
};

export type UserEntry = {
  userId: string;
  userName: string;
  userEmail: string;
  sources: UserSource[];
};

// "Used by" panel on the connection detail page. The Users column shows
// every effective user — workspace members of any workspace using this
// connector PLUS direct UserDataSourceAccess grants — with per-source
// provenance so admins can answer "why does X have access?" without
// jumping pages.

export function UsedByCard({
  dataSourceId,
  workspaces,
  users,
  directGrantCount,
  canManageDirectGrants,
}: {
  dataSourceId: string;
  workspaces: WorkspaceEntry[];
  users: UserEntry[];
  directGrantCount: number;
  canManageDirectGrants: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "workspaces" | "users">("all");

  async function onRemoveDirectGrant(userId: string, userName: string) {
    if (
      !confirm(
        `Remove direct grant for ${userName} on this connector? They keep access through any workspace memberships.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/users/${userId}/data-sources/${dataSourceId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Remove failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  const wsFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return workspaces.filter((w) => !s || w.workspaceName.toLowerCase().includes(s));
  }, [workspaces, search]);

  const usersFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        !s ||
        u.userName.toLowerCase().includes(s) ||
        u.userEmail.toLowerCase().includes(s) ||
        u.sources.some(
          (src) => src.workspaceName && src.workspaceName.toLowerCase().includes(s),
        ),
    );
  }, [users, search]);

  const isEmpty = workspaces.length === 0 && users.length === 0;
  const showWs = show !== "users" && wsFiltered.length > 0;
  const showUsers = show !== "workspaces" && usersFiltered.length > 0;
  const totalShown = (show === "users" ? 0 : wsFiltered.length) + (show === "workspaces" ? 0 : usersFiltered.length);
  const totalAll = workspaces.length + users.length;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>
              Used by ({workspaces.length} workspace{workspaces.length === 1 ? "" : "s"},{" "}
              {users.length} user{users.length === 1 ? "" : "s"})
            </CardTitle>
            {directGrantCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Includes {directGrantCount} direct grant{directGrantCount === 1 ? "" : "s"} plus everyone reachable through workspace memberships.
              </p>
            )}
          </div>
          {!isEmpty && (
            <div className="text-xs text-muted-foreground">
              {totalShown} of {totalAll}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEmpty ? (
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search workspaces & users…"
                  className="h-9 pl-8"
                />
              </div>
              <Select value={show} onValueChange={(v) => setShow(v as typeof show)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Show both</SelectItem>
                  <SelectItem value="workspaces">Workspaces only</SelectItem>
                  <SelectItem value="users">Users only</SelectItem>
                </SelectContent>
              </Select>
              {(search || show !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setShow("all");
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {totalShown === 0 ? (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nothing matches your filter.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {showWs && (
                  <Section
                    title="Workspaces"
                    icon={<FolderTree className="h-3.5 w-3.5" />}
                    count={wsFiltered.length}
                    totalCount={workspaces.length}
                  >
                    {wsFiltered.map((w) => (
                      <li
                        key={w.id}
                        className="flex min-h-[64px] items-center justify-between rounded-md border border-border p-3"
                      >
                        <Link
                          href={`/workspaces/${w.workspaceId}`}
                          className="min-w-0 flex-1 truncate hover:text-primary"
                        >
                          <div className="font-medium">{w.workspaceName}</div>
                          <div className="text-xs text-muted-foreground">
                            {w.memberCount} member{w.memberCount === 1 ? "" : "s"}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </Section>
                )}
                {showUsers && (
                  <Section
                    title="Users with access"
                    icon={<UserIcon className="h-3.5 w-3.5" />}
                    count={usersFiltered.length}
                    totalCount={users.length}
                  >
                    {usersFiltered.map((u) => {
                      const hasDirect = u.sources.some((s) => s.kind === "direct");
                      return (
                      <li
                        key={u.userId}
                        className="group rounded-md border border-border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/users/${u.userId}`}
                            className="min-w-0 flex-1 truncate hover:text-primary"
                          >
                            <div className="font-medium">{u.userName}</div>
                            <div className="text-xs text-muted-foreground">{u.userEmail}</div>
                          </Link>
                          {canManageDirectGrants && hasDirect && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveDirectGrant(u.userId, u.userName)}
                              aria-label="Remove direct grant"
                              title="Remove direct grant on this connector"
                              className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          {hasDirect && (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1 text-[10px]"
                              title="Has a direct UserDataSourceAccess grant"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              direct
                            </Badge>
                          )}
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {u.sources.map((s, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-1.5">
                              {s.kind === "workspace" && s.workspaceId ? (
                                <Link
                                  href={`/workspaces/${s.workspaceId}`}
                                  className="hover:text-primary"
                                >
                                  via {s.workspaceName}
                                </Link>
                              ) : (
                                <span className="italic">direct grant</span>
                              )}
                              <span className="text-border">·</span>
                              <div className="flex gap-1">
                                {s.permissions.length === 0 ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    no perms
                                  </Badge>
                                ) : (
                                  Array.from(
                                    effectiveLevelsFor(
                                      s.permissions as PermissionLevel[],
                                    ),
                                  ).map((p) => (
                                    <Badge
                                      key={p}
                                      variant="outline"
                                      className="text-[10px] uppercase"
                                    >
                                      {EFFECTIVE_LEVEL_LABEL[p]}
                                    </Badge>
                                  ))
                                )}
                              </div>
                              {s.allowedTablesLabel && (
                                <span
                                  className="opacity-70"
                                  title={s.allowedTables ? s.allowedTables.join(", ") : undefined}
                                >
                                  · {s.allowedTablesLabel}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                      );
                    })}
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  icon,
  count,
  totalCount,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  totalCount: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
        <span className="ml-auto normal-case">
          {count}
          {count !== totalCount && ` / ${totalCount}`}
        </span>
      </div>
      <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">{children}</ul>
    </div>
  );
}
