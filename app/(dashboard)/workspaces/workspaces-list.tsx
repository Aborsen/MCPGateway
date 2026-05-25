"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layouts/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  dataSourceCount: number;
  userCount: number;
  userNames: string[]; // truncated preview (server caps to ~5)
  createdAt: string;
  canDelete: boolean;
};

type SortKey = "name" | "dataSourceCount" | "userCount" | "createdAt";
type SortDir = "asc" | "desc";
type SizeFilter = "all" | "with-users" | "empty-users" | "with-sources" | "empty-sources";

export function WorkspacesList({
  initial,
  viewerCanCreate,
}: {
  initial: Workspace[];
  viewerCanCreate: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = initial.filter((w) => {
      if (
        q &&
        !w.name.toLowerCase().includes(q) &&
        !(w.description ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      switch (sizeFilter) {
        case "with-users":
          if (w.userCount === 0) return false;
          break;
        case "empty-users":
          if (w.userCount > 0) return false;
          break;
        case "with-sources":
          if (w.dataSourceCount === 0) return false;
          break;
        case "empty-sources":
          if (w.dataSourceCount > 0) return false;
          break;
      }
      return true;
    });
    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "dataSourceCount":
          return (a.dataSourceCount - b.dataSourceCount) * dir;
        case "userCount":
          return (a.userCount - b.userCount) * dir;
        case "createdAt":
          return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return rows;
  }, [initial, search, sizeFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  // Filter is_visible — the bulk-delete bar shows only when at least one
  // selected row is deletable by the viewer. The server re-checks anyway.
  const deletableSelected = filtered.filter(
    (w) => selectedIds.has(w.id) && w.canDelete,
  );

  async function onDeleteRow(w: Workspace) {
    if (
      !confirm(
        `Delete workspace "${w.name}"? Users assigned to this workspace lose access.`,
      )
    )
      return;
    const res = await fetch(`/api/workspaces/${w.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Delete failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <TooltipProvider delayDuration={150}>
      <PageHeader
        title="Workspaces"
        description="Group data sources, restrict tables, and assign users with view / edit / delete permissions."
        actions={
          viewerCanCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Workspace
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 p-6">
        {/* Search + filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or description…"
              className="pl-9"
            />
          </div>
          <Select value={sizeFilter} onValueChange={(v) => setSizeFilter(v as SizeFilter)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspaces</SelectItem>
              <SelectItem value="with-users">With users</SelectItem>
              <SelectItem value="empty-users">No users</SelectItem>
              <SelectItem value="with-sources">With data sources</SelectItem>
              <SelectItem value="empty-sources">No data sources</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk-delete bar (only shows when something deletable is selected) */}
        {deletableSelected.length > 0 && (
          <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span>
              <strong>{deletableSelected.length}</strong> selected
              {selectedIds.size > deletableSelected.length && (
                <span className="ml-1 text-muted-foreground">
                  ({selectedIds.size - deletableSelected.length} cannot be deleted)
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete {deletableSelected.length}…
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
                <th className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={
                      filtered.length > 0 &&
                      filtered.every((w) => selectedIds.has(w.id))
                        ? true
                        : filtered.some((w) => selectedIds.has(w.id))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => {
                      const next = new Set(selectedIds);
                      if (v === true) {
                        for (const w of filtered) next.add(w.id);
                      } else {
                        for (const w of filtered) next.delete(w.id);
                      }
                      setSelectedIds(next);
                    }}
                    aria-label="Select all"
                  />
                </th>
                <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortHeader
                  label="Data sources"
                  sortKey="dataSourceCount"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Users"
                  sortKey="userCount"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Created"
                  sortKey="createdAt"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <th className="px-4 py-3 text-right font-medium">Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {initial.length === 0
                      ? "No workspaces yet — create one to get started."
                      : "No workspaces match the current filter."}
                  </td>
                </tr>
              )}
              {filtered.map((w) => (
                <tr
                  key={w.id}
                  className={cn(
                    "cursor-pointer border-t border-border transition-colors hover:bg-muted/30",
                  )}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/workspaces/${w.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/workspaces/${w.id}`);
                    }
                  }}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(w.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        if (v === true) next.add(w.id);
                        else next.delete(w.id);
                        setSelectedIds(next);
                      }}
                      aria-label={`Select ${w.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/workspaces/${w.id}`}
                      className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FolderTree className="h-3.5 w-3.5 text-primary" />
                      {w.name}
                    </Link>
                    {w.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {w.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {w.dataSourceCount}
                  </td>
                  <td className="px-4 py-3">
                    <UserCountCell
                      workspaceId={w.id}
                      count={w.userCount}
                      names={w.userNames}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(w.createdAt)}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Quick actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={() => router.push(`/workspaces/${w.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {w.canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => onDeleteRow(w)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          router.push(`/workspaces/${id}`);
        }}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        workspaceIds={deletableSelected.map((w) => w.id)}
        onSaved={(failedIds) => {
          setBulkDeleteOpen(false);
          setSelectedIds(new Set(failedIds));
          startTransition(() => router.refresh());
        }}
      />
    </TooltipProvider>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setName("");
      setDescription("");
      onCreated(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Configure data source restrictions and user assignments on the workspace page
            after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Sales Team"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-desc">Description</Label>
            <Textarea
              id="ws-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  open,
  onOpenChange,
  workspaceIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceIds: string[];
  onSaved: (failedIds: string[]) => void;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        succeeded: number;
        failed: number;
        failedDetails: { workspaceId: string; error: string }[];
      }
  >(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/workspaces/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? `Bulk delete failed (${res.status})`);
        return;
      }
      const failedDetails = (
        data.results as { workspaceId: string; ok: boolean; error?: string }[]
      )
        .filter((r) => !r.ok)
        .map((r) => ({ workspaceId: r.workspaceId, error: r.error ?? "" }));
      setResult({
        succeeded: data.succeeded as number,
        failed: data.failed as number,
        failedDetails,
      });
      onSaved(failedDetails.map((f) => f.workspaceId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {workspaceIds.length} workspace
            {workspaceIds.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Soft-deletes the selected workspaces. Members lose access to every connector
            that was reached via these workspaces (direct grants are unaffected).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {result && (
            <div className="rounded-md border border-border p-3 text-sm">
              <div>
                <span className="font-medium text-success">
                  {result.succeeded} deleted
                </span>
                {result.failed > 0 && (
                  <span className="ml-2 text-destructive">
                    · {result.failed} failed
                  </span>
                )}
              </div>
              {result.failedDetails.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {result.failedDetails.slice(0, 5).map((f) => (
                    <li key={f.workspaceId}>
                      <code>{f.workspaceId.slice(0, 8)}</code>: {f.error}
                    </li>
                  ))}
                  {result.failedDetails.length > 5 && (
                    <li>+{result.failedDetails.length - 5} more…</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button
                type="submit"
                variant="destructive"
                disabled={workspaceIds.length === 0 || pending}
              >
                {pending
                  ? "Deleting…"
                  : `Delete ${workspaceIds.length} workspace${
                      workspaceIds.length === 1 ? "" : "s"
                    }`}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "m-0 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-left text-inherit hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}

function UserCountCell({
  workspaceId,
  count,
  names,
}: {
  workspaceId: string;
  count: number;
  names: string[];
}) {
  if (count === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/workspaces/${workspaceId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          {count}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="space-y-1 text-xs">
          {names.map((n) => (
            <div key={n}>{n}</div>
          ))}
          {count > names.length && (
            <div className="text-muted-foreground">+{count - names.length} more</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
