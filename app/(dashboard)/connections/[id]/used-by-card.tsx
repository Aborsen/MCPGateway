"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FolderTree, User as UserIcon, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type WorkspaceEntry = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  memberCount: number;
  allowedTablesLabel: string;
};

export type UserSource = {
  kind: "workspace" | "direct";
  workspaceId?: string;
  workspaceName?: string;
  permissions: string[];
  allowedTablesLabel: string | null;
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
  workspaces,
  users,
  directGrantCount,
}: {
  workspaces: WorkspaceEntry[];
  users: UserEntry[];
  directGrantCount: number;
}) {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "workspaces" | "users">("all");

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
                        <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                          {w.allowedTablesLabel}
                        </Badge>
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
                    {usersFiltered.map((u) => (
                      <li
                        key={u.userId}
                        className="rounded-md border border-border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/users/${u.userId}`}
                            className="min-w-0 flex-1 truncate hover:text-primary"
                          >
                            <div className="font-medium">{u.userName}</div>
                            <div className="text-xs text-muted-foreground">{u.userEmail}</div>
                          </Link>
                          {u.sources.some((s) => s.kind === "direct") && (
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
                                  s.permissions.map((p) => (
                                    <Badge
                                      key={p}
                                      variant="outline"
                                      className="text-[10px] uppercase"
                                    >
                                      {p}
                                    </Badge>
                                  ))
                                )}
                              </div>
                              {s.allowedTablesLabel && (
                                <span className="opacity-70">· {s.allowedTablesLabel}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
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
