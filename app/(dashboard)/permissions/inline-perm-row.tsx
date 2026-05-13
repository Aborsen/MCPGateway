"use client";

import { useState } from "react";
import { Check, FolderTree, Sparkles, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEVELS, LEVEL_LABEL, type GrantCell, type PermissionLevel } from "./permissions-types";

// Reusable row showing a single (user × connection) grant with R/W/D toggle pills.
// Used in both By User and By Connection right-pane lists.
export function InlinePermRow({
  label,
  sublabel,
  cell,
  onSave,
  onRevokeDirect,
  emphasis,
}: {
  label: string;
  sublabel?: string;
  cell: GrantCell | undefined;
  onSave: (next: PermissionLevel[]) => void | Promise<void>;
  onRevokeDirect?: () => void | Promise<void>;
  emphasis?: boolean;
}) {
  const directSource = cell?.sources.find((s) => s.kind === "direct");
  const workspaceSources = cell?.sources.filter((s) => s.kind === "workspace") ?? [];
  const workspaceOnly = !directSource && workspaceSources.length > 0;
  const [busy, setBusy] = useState(false);
  const effective = new Set<PermissionLevel>(cell?.permissions ?? []);
  const directPerms = new Set<PermissionLevel>(directSource?.permissions ?? []);

  async function toggleDirect(p: PermissionLevel) {
    if (workspaceOnly) return;
    const next = new Set(directPerms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setBusy(true);
    try {
      await onSave(Array.from(next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0",
        emphasis && "bg-primary/5",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          {directSource && (
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary"
              title="Has a direct grant"
            >
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
        {workspaceSources.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {workspaceSources.map((s) => (
              <span
                key={s.kind === "workspace" ? s.workspaceId : "direct"}
                className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
              >
                <FolderTree className="h-2.5 w-2.5" />
                {s.kind === "workspace" ? s.workspaceName : "direct"}
                <span className="text-muted-foreground">·</span>
                <span className="uppercase">{s.permissions.join(",") || "—"}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {LEVELS.map((p) => {
          const isEffective = effective.has(p);
          const isDirect = directPerms.has(p);
          return (
            <button
              key={p}
              onClick={() => toggleDirect(p)}
              disabled={busy || workspaceOnly}
              title={
                workspaceOnly
                  ? `Managed by Workspace — edit on the workspace page`
                  : isDirect
                    ? `Direct grant: ${LEVEL_LABEL[p]}`
                    : isEffective
                      ? `Via workspace: ${LEVEL_LABEL[p]} (click to add direct grant)`
                      : `Click to grant ${LEVEL_LABEL[p]}`
              }
              className={cn(
                "inline-flex h-7 w-[88px] items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium uppercase tracking-wide transition-colors",
                isDirect && "border-primary bg-primary text-primary-foreground",
                !isDirect && isEffective && !workspaceOnly && "border-success/60 bg-success/15 text-success",
                !isDirect && isEffective && workspaceOnly && "border-border bg-muted/40 text-muted-foreground cursor-not-allowed",
                !isDirect && !isEffective && !workspaceOnly && "border-border text-muted-foreground hover:bg-muted",
                !isDirect && !isEffective && workspaceOnly && "border-border/60 text-muted-foreground/60 cursor-not-allowed",
                busy && "opacity-60",
              )}
            >
              {/* Always reserve a 12px slot for the check so pill width
                  stays constant whether the permission is active or not. */}
              <span className="inline-flex w-3 shrink-0 items-center justify-center">
                {isEffective ? <Check className="h-3 w-3" /> : null}
              </span>
              {LEVEL_LABEL[p]}
            </button>
          );
        })}
        {/* Always reserve space for the menu so columns stay aligned across rows */}
        <div className="ml-1 w-7">
          {directSource && onRevokeDirect && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => onRevokeDirect()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke direct grant
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

export function GrantBadges({ cell }: { cell: GrantCell | undefined }) {
  if (!cell || cell.permissions.length === 0) {
    return <span className="text-xs text-muted-foreground">No access</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {LEVELS.map((p) => (
        <Badge
          key={p}
          variant={cell.permissions.includes(p) ? "success" : "outline"}
          className={cn("uppercase", !cell.permissions.includes(p) && "opacity-30")}
        >
          {cell.permissions.includes(p) ? <Check className="h-3 w-3" /> : null}
          {p[0]}
        </Badge>
      ))}
    </div>
  );
}
