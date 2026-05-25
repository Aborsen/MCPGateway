"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Sparkles, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BreakdownPanel } from "./breakdown-panel";
import {
  EFFECTIVE_LEVELS,
  EFFECTIVE_LEVEL_SHORT,
  effectiveLevelsFor,
  type EffectiveLevel,
  type GrantCell,
  type MatrixPayload,
} from "./permissions-types";

const MAX_CELLS = 800; // visual ceiling for the matrix tab

export function MatrixView({
  data,
  onChange,
}: {
  data: MatrixPayload;
  onChange: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<{ userId: string; dataSourceId: string } | null>(null);

  const grantMap = useMemo(() => {
    return new Map(data.grants.map((g) => [`${g.userId}::${g.dataSourceId}`, g]));
  }, [data.grants]);

  const cellCount = data.users.length * data.dataSources.length;
  const tooLarge = cellCount > MAX_CELLS;

  const selectedCell = useMemo(() => {
    if (!selected) return null;
    const user = data.users.find((u) => u.id === selected.userId);
    const ds = data.dataSources.find((d) => d.id === selected.dataSourceId);
    const grant = grantMap.get(`${selected.userId}::${selected.dataSourceId}`);
    if (!user || !ds) return null;
    return { user, dataSource: ds, grant };
  }, [selected, data, grantMap]);

  if (tooLarge) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center">
        <div className="max-w-md space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold">Matrix view is hidden for large accounts</h3>
          <p className="text-xs text-muted-foreground">
            {data.users.length} users × {data.dataSources.length} connections = {cellCount} cells.
            The matrix is shown only when there are ≤ {MAX_CELLS} cells; otherwise use{" "}
            <span className="font-medium">By User</span> or{" "}
            <span className="font-medium">By Connection</span> for filterable, scalable views.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
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
                  const cell = grantMap.get(`${u.id}::${d.id}`);
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
                          {(() => {
                            const active = effectiveLevelsFor(cell!.permissions);
                            return EFFECTIVE_LEVELS.map((p) => (
                              <PermBadge key={p} level={p} active={active.has(p)} />
                            ));
                          })()}
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
      </div>

      {selectedCell && (
        <BreakdownPanel
          user={selectedCell.user}
          dataSource={selectedCell.dataSource}
          grant={selectedCell.grant}
          onClose={() => setSelected(null)}
          onSaved={onChange}
        />
      )}
    </>
  );
}

function PermBadge({ level, active }: { level: EffectiveLevel; active: boolean }) {
  return (
    <Badge
      variant={active ? "success" : "outline"}
      className={cn("uppercase", !active && "opacity-30")}
    >
      {active ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {EFFECTIVE_LEVEL_SHORT[level]}
    </Badge>
  );
}
