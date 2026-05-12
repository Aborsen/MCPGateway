"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BreakdownPanel } from "./breakdown-panel";

export type PermissionLevel = "read" | "write" | "delete";

export type GrantSource =
  | {
      kind: "workspace";
      workspaceId: string;
      workspaceName: string;
      permissions: PermissionLevel[];
      allowedTables: string[] | null;
    }
  | {
      kind: "direct";
      permissions: PermissionLevel[];
      allowedTables: string[] | null;
    };

export type GrantCell = {
  userId: string;
  dataSourceId: string;
  permissions: PermissionLevel[];
  allowedTables: string[] | null;
  sources: GrantSource[];
};

type MatrixPayload = {
  users: Array<{ id: string; name: string; email: string; role: string }>;
  dataSources: Array<{ id: string; name: string; slug: string; type: string }>;
  grants: GrantCell[];
};

const LEVELS: PermissionLevel[] = ["read", "write", "delete"];

export function PermissionsMatrix() {
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ userId: string; dataSourceId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/permissions", { cache: "no-store" });
      const payload = await res.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grantMap = useMemo(() => {
    if (!data) return new Map<string, GrantCell>();
    return new Map(data.grants.map((g) => [`${g.userId}::${g.dataSourceId}`, g]));
  }, [data]);

  const selectedCell = useMemo(() => {
    if (!selected || !data) return null;
    const user = data.users.find((u) => u.id === selected.userId);
    const ds = data.dataSources.find((d) => d.id === selected.dataSourceId);
    const grant = grantMap.get(`${selected.userId}::${selected.dataSourceId}`);
    if (!user || !ds) return null;
    return { user, dataSource: ds, grant };
  }, [selected, data, grantMap]);

  function getCell(userId: string, dataSourceId: string): GrantCell | undefined {
    return grantMap.get(`${userId}::${dataSourceId}`);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card/30 px-6 py-3">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.users.length} users × ${data.dataSources.length} connections` : "Loading…"}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        {!data ? (
          <div className="px-6 py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-medium">User</th>
                {data.dataSources.map((d) => (
                  <th key={d.id} className="px-4 py-3 text-left font-medium">
                    <Link href={`/connections/${d.id}`} className="hover:text-foreground">
                      {d.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-4 py-3">
                    <Link href={`/users/${u.id}`} className="font-medium hover:text-primary">
                      {u.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  {data.dataSources.map((d) => {
                    const cell = getCell(u.id, d.id);
                    const isSelected =
                      selected?.userId === u.id && selected?.dataSourceId === d.id;
                    const hasAny = (cell?.permissions.length ?? 0) > 0;
                    const hasDirect = cell?.sources.some((s) => s.kind === "direct") ?? false;
                    return (
                      <td
                        key={d.id}
                        onClick={() => setSelected({ userId: u.id, dataSourceId: d.id })}
                        className={cn(
                          "cursor-pointer px-4 py-3 transition-colors hover:bg-muted/40",
                          isSelected && "bg-primary/10",
                        )}
                      >
                        {hasAny ? (
                          <div className="flex items-center gap-1">
                            {LEVELS.map((p) => (
                              <PermBadge key={p} level={p} active={cell!.permissions.includes(p)} />
                            ))}
                            {hasDirect && (
                              <span
                                title="Has a direct grant"
                                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary"
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No access</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedCell && (
        <BreakdownPanel
          user={selectedCell.user}
          dataSource={selectedCell.dataSource}
          grant={selectedCell.grant}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await load();
          }}
        />
      )}
    </>
  );
}

function PermBadge({ level, active }: { level: PermissionLevel; active: boolean }) {
  return (
    <Badge
      variant={active ? "success" : "outline"}
      className={cn("uppercase", !active && "opacity-30")}
    >
      {active ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {level[0]}
    </Badge>
  );
}
