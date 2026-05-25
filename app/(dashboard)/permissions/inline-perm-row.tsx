"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, FolderTree, MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EFFECTIVE_LEVELS,
  EFFECTIVE_LEVEL_LABEL,
  effectiveLevelsFor,
  expandEffectiveSet,
  setEffective,
  type EffectiveLevel,
  type GrantCell,
  type GrantSource,
  type PermissionLevel,
} from "./permissions-types";

type WorkspaceSource = Extract<GrantSource, { kind: "workspace" }>;
type EditingState = { source: WorkspaceSource; initialPerms: PermissionLevel[] };

// Reusable row showing a single (user × connection) grant with R/W/D toggle pills.
// Used in both By User and By Connection right-pane lists.
export function InlinePermRow({
  label,
  sublabel,
  cell,
  onSave,
  onRevokeDirect,
  onSaveWorkspace,
  userLabel,
  connectionLabel,
  emphasis,
}: {
  label: string;
  sublabel?: string;
  cell: GrantCell | undefined;
  onSave: (next: PermissionLevel[]) => void | Promise<void>;
  onRevokeDirect?: () => void | Promise<void>;
  onSaveWorkspace?: (workspaceId: string, perms: PermissionLevel[]) => void | Promise<void>;
  userLabel?: string;
  connectionLabel?: string;
  emphasis?: boolean;
}) {
  const directSource = cell?.sources.find((s) => s.kind === "direct");
  const workspaceSources = (cell?.sources.filter(
    (s): s is WorkspaceSource => s.kind === "workspace",
  )) ?? [];
  const workspaceOnly = !directSource && workspaceSources.length > 0;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const effectiveLevels = effectiveLevelsFor(cell?.permissions ?? []);
  const directEffectiveLevels = effectiveLevelsFor(directSource?.permissions ?? []);
  // Keep the raw direct-perm array around for the toggle handler — applying
  // a UI-level toggle returns a new raw array we POST/PUT to the backend.
  const directPermsArr = directSource?.permissions ?? [];

  const chipsClickable = !!onSaveWorkspace;
  const canEditWorkspace = workspaceOnly && chipsClickable;
  const singleWorkspace = workspaceSources.length === 1 ? workspaceSources[0] : null;

  function openWorkspaceEdit(source: WorkspaceSource, toggleLevel?: EffectiveLevel) {
    let next = source.permissions;
    if (toggleLevel) {
      const currentLevels = effectiveLevelsFor(source.permissions);
      next = setEffective(source.permissions, toggleLevel, !currentLevels.has(toggleLevel));
    }
    setEditing({ source, initialPerms: next });
  }

  async function toggleDirect(level: EffectiveLevel) {
    if (workspaceOnly) return;
    const next = setEffective(directPermsArr, level, !directEffectiveLevels.has(level));
    setBusy(true);
    try {
      await onSave(next);
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
            {workspaceSources.map((s) => {
              const chipClass =
                "group inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground";
              const sourceLevels = Array.from(effectiveLevelsFor(s.permissions));
              const sourceLabel = sourceLevels.length
                ? sourceLevels.map((l) => EFFECTIVE_LEVEL_LABEL[l]).join(",")
                : "—";
              const inner = (
                <>
                  <FolderTree className="h-2.5 w-2.5" />
                  {s.workspaceName}
                  <span className="text-muted-foreground">·</span>
                  <span className="uppercase">{sourceLabel}</span>
                </>
              );
              return chipsClickable ? (
                <button
                  key={s.workspaceId}
                  type="button"
                  onClick={() => openWorkspaceEdit(s)}
                  className={cn(chipClass, "transition-colors hover:bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1")}
                  title={`Click to edit ${s.workspaceName} workspace permissions`}
                >
                  {inner}
                  <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60" />
                </button>
              ) : (
                <span key={s.workspaceId} className={chipClass}>
                  {inner}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {EFFECTIVE_LEVELS.map((p) => {
          const isEffective = effectiveLevels.has(p);
          const isDirect = directEffectiveLevels.has(p);

          const pillClass = cn(
            "inline-flex h-7 w-[88px] items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium uppercase tracking-wide transition-colors",
            isDirect && "border-primary bg-primary text-primary-foreground",
            !isDirect && isEffective && !workspaceOnly && "border-success/60 bg-success/15 text-success",
            !isDirect && isEffective && workspaceOnly && canEditWorkspace && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer",
            !isDirect && isEffective && workspaceOnly && !canEditWorkspace && "border-border bg-muted/40 text-muted-foreground cursor-not-allowed",
            !isDirect && !isEffective && !workspaceOnly && "border-border text-muted-foreground hover:bg-muted",
            !isDirect && !isEffective && workspaceOnly && canEditWorkspace && "border-dashed border-primary/30 text-primary/70 hover:bg-primary/5 hover:text-primary cursor-pointer",
            !isDirect && !isEffective && workspaceOnly && !canEditWorkspace && "border-border/60 text-muted-foreground/60 cursor-not-allowed",
            busy && "opacity-60",
          );

          const pillTitle = workspaceOnly
            ? canEditWorkspace
              ? singleWorkspace
                ? `Via ${singleWorkspace.workspaceName}: ${EFFECTIVE_LEVEL_LABEL[p]} — click to edit workspace permissions`
                : `Via workspace: ${EFFECTIVE_LEVEL_LABEL[p]} — click to pick which workspace to edit`
              : `Managed by Workspace — edit on the workspace page`
            : isDirect
              ? `Direct grant: ${EFFECTIVE_LEVEL_LABEL[p]}`
              : isEffective
                ? `Via workspace: ${EFFECTIVE_LEVEL_LABEL[p]} (click to add direct grant)`
                : `Click to grant ${EFFECTIVE_LEVEL_LABEL[p]}`;

          const pillContent = (
            <>
              {/* Always reserve a 12px slot for the check so pill width
                  stays constant whether the permission is active or not. */}
              <span className="inline-flex w-3 shrink-0 items-center justify-center">
                {isEffective ? <Check className="h-3 w-3" /> : null}
              </span>
              {EFFECTIVE_LEVEL_LABEL[p]}
            </>
          );

          // Multi-workspace case: pill becomes a dropdown trigger so the user
          // picks which workspace's permissions to edit before the dialog opens.
          if (workspaceOnly && canEditWorkspace && !singleWorkspace) {
            return (
              <DropdownMenu key={p}>
                <DropdownMenuTrigger asChild>
                  <button disabled={busy} title={pillTitle} className={pillClass}>
                    {pillContent}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {workspaceSources.map((s) => (
                    <DropdownMenuItem
                      key={s.workspaceId}
                      onSelect={() => openWorkspaceEdit(s, p)}
                    >
                      <FolderTree className="h-3.5 w-3.5" />
                      Edit via {s.workspaceName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <button
              key={p}
              onClick={() => {
                if (workspaceOnly && canEditWorkspace && singleWorkspace) {
                  openWorkspaceEdit(singleWorkspace, p);
                  return;
                }
                toggleDirect(p);
              }}
              disabled={busy || (workspaceOnly && !canEditWorkspace)}
              title={pillTitle}
              className={pillClass}
            >
              {pillContent}
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
      {chipsClickable && editing && (
        <WorkspacePermDialog
          source={editing.source}
          initialPerms={editing.initialPerms}
          userLabel={userLabel ?? "this user"}
          connectionLabel={connectionLabel ?? label}
          onClose={() => setEditing(null)}
          onSave={async (perms) => {
            await onSaveWorkspace!(editing.source.workspaceId, perms);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WorkspacePermDialog({
  source,
  initialPerms,
  userLabel,
  connectionLabel,
  onClose,
  onSave,
}: {
  source: WorkspaceSource;
  initialPerms: PermissionLevel[];
  userLabel: string;
  connectionLabel: string;
  onClose: () => void;
  onSave: (perms: PermissionLevel[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<EffectiveLevel>>(effectiveLevelsFor(initialPerms));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(effectiveLevelsFor(initialPerms));
    setError(null);
  }, [source, initialPerms]);

  function toggle(p: EffectiveLevel) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelected(next);
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onSave(expandEffectiveSet(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setPending(false);
    }
  }

  const original = effectiveLevelsFor(source.permissions);
  const willRemove = selected.size === 0;
  const changed =
    selected.size !== original.size ||
    Array.from(selected).some((p) => !original.has(p));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {source.workspaceName} workspace permissions for {userLabel}
          </DialogTitle>
          <DialogDescription>
            Set which data-level permissions {userLabel} has via the{" "}
            <span className="font-medium">{source.workspaceName}</span> workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <div>
            This affects <span className="font-semibold">every connector</span> in{" "}
            <span className="font-semibold">{source.workspaceName}</span>, not just{" "}
            <span className="font-semibold">{connectionLabel}</span>.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {EFFECTIVE_LEVELS.map((p) => {
            const on = selected.has(p);
            const wasOn = original.has(p);
            const diff = on !== wasOn;
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle(p)}
                disabled={pending}
                title={
                  diff
                    ? on
                      ? `${EFFECTIVE_LEVEL_LABEL[p]} — will be added`
                      : `${EFFECTIVE_LEVEL_LABEL[p]} — will be removed`
                    : EFFECTIVE_LEVEL_LABEL[p]
                }
                className={cn(
                  "relative inline-flex h-8 w-[100px] items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium uppercase tracking-wide transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                  diff && "ring-2 ring-amber-500/60 ring-offset-1 ring-offset-card",
                  pending && "opacity-60",
                )}
              >
                <span className="inline-flex w-3 shrink-0 items-center justify-center">
                  {on ? <Check className="h-3 w-3" /> : null}
                </span>
                {EFFECTIVE_LEVEL_LABEL[p]}
              </button>
            );
          })}
        </div>
        {willRemove && (
          <p className="text-xs text-destructive">
            Saving with no permissions selected will remove {userLabel} from{" "}
            <span className="font-semibold">{source.workspaceName}</span> entirely.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !changed}
            variant={willRemove ? "destructive" : "default"}
          >
            {pending ? "Saving…" : willRemove ? "Remove from workspace" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GrantBadges({ cell }: { cell: GrantCell | undefined }) {
  if (!cell || cell.permissions.length === 0) {
    return <span className="text-xs text-muted-foreground">No access</span>;
  }
  const active = effectiveLevelsFor(cell.permissions);
  return (
    <div className="flex items-center gap-1">
      {EFFECTIVE_LEVELS.map((p) => (
        <Badge
          key={p}
          variant={active.has(p) ? "success" : "outline"}
          className={cn("uppercase", !active.has(p) && "opacity-30")}
        >
          {active.has(p) ? <Check className="h-3 w-3" /> : null}
          {p[0]}
        </Badge>
      ))}
    </div>
  );
}
