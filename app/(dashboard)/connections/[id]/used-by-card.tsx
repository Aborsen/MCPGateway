"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FolderTree, User as UserIcon } from "lucide-react";
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
  allowedTablesLabel: string; // pre-rendered: "All tables" or "Restricted: contacts, deals"
};

export type DirectGrantEntry = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  permissionsLabel: string; // pre-rendered: "read, write, delete"
  allowedTablesLabel: string | null; // pre-rendered or null
};

export function UsedByCard({
  workspaces,
  directGrants,
}: {
  workspaces: WorkspaceEntry[];
  directGrants: DirectGrantEntry[];
}) {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "workspaces" | "direct">("all");

  const wsFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return workspaces.filter((w) => !s || w.workspaceName.toLowerCase().includes(s));
  }, [workspaces, search]);

  const dgFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return directGrants.filter(
      (g) =>
        !s ||
        g.userName.toLowerCase().includes(s) ||
        g.userEmail.toLowerCase().includes(s),
    );
  }, [directGrants, search]);

  const totalShown =
    (show === "direct" ? 0 : wsFiltered.length) +
    (show === "workspaces" ? 0 : dgFiltered.length);
  const totalAll = workspaces.length + directGrants.length;
  const isEmpty = workspaces.length === 0 && directGrants.length === 0;
  const showWs = show !== "direct" && wsFiltered.length > 0;
  const showDg = show !== "workspaces" && dgFiltered.length > 0;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>
            Used by ({workspaces.length} workspace{workspaces.length === 1 ? "" : "s"},{" "}
            {directGrants.length} direct grant{directGrants.length === 1 ? "" : "s"})
          </CardTitle>
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
                  <SelectItem value="direct">Direct grants only</SelectItem>
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
                        className="flex items-center justify-between rounded-md border border-border p-3"
                      >
                        <Link
                          href={`/workspaces/${w.workspaceId}`}
                          className="truncate font-medium hover:text-primary"
                        >
                          {w.workspaceName}
                        </Link>
                        <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                          {w.allowedTablesLabel}
                        </Badge>
                      </li>
                    ))}
                  </Section>
                )}
                {showDg && (
                  <Section
                    title="Direct grants"
                    icon={<UserIcon className="h-3.5 w-3.5" />}
                    count={dgFiltered.length}
                    totalCount={directGrants.length}
                  >
                    {dgFiltered.map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
                      >
                        <Link
                          href={`/users/${g.userId}`}
                          className="min-w-0 flex-1 truncate hover:text-primary"
                        >
                          <div className="font-medium">{g.userName}</div>
                          <div className="text-xs text-muted-foreground">{g.userEmail}</div>
                        </Link>
                        <div className="text-right text-xs text-muted-foreground">
                          <div className="uppercase">{g.permissionsLabel}</div>
                          {g.allowedTablesLabel && (
                            <div className="mt-0.5 opacity-70">{g.allowedTablesLabel}</div>
                          )}
                        </div>
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
