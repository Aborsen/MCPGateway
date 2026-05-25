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
  Download,
  ShieldOff,
  MoreHorizontal,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layouts/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserFormDialog, type User } from "./user-form";
import { ROLES, ROLE_LABEL, badgeVariantFor, labelFor } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type SortKey = "name" | "email" | "role" | "workspaceCount" | "mcpStatus" | "createdAt";
type SortDir = "asc" | "desc";

const ROLE_RANK: Record<string, number> = {
  OWNER: 0,
  ADMIN: 1,
  EDITOR: 2,
  STAFF: 3,
  GUEST: 4,
  USER: 5,
};

type BulkRoleOption = { id: string; slug: string; name: string; isSystem: boolean };

export function UsersList({
  initial,
  viewerRole,
  viewerId,
  viewerIsOwner,
  viewerCanChangeRole,
  viewerCanDelete,
  viewerCanManageAssignments,
  bulkAssignableRoles,
  roleCounts,
}: {
  initial: User[];
  viewerRole: string;
  viewerId: string;
  viewerIsOwner: boolean;
  viewerCanChangeRole: boolean;
  viewerCanDelete: boolean;
  viewerCanManageAssignments: boolean;
  bulkAssignableRoles: BulkRoleOption[];
  roleCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = initial.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      return true;
    });
    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "role":
          return ((ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99)) * dir;
        case "workspaceCount":
          return (a.workspaceCount - b.workspaceCount) * dir;
        case "mcpStatus":
          return (
            (a.mcpStatus === b.mcpStatus ? 0 : a.mcpStatus === "active" ? -1 : 1) * dir
          );
        case "createdAt":
          return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
        default:
          return a[sort.key].localeCompare(b[sort.key]) * dir;
      }
    });
    return rows;
  }, [initial, search, roleFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function onInvite() {
    setEditing(null);
    setOpen(true);
  }
  function onEdit(u: User) {
    setEditing(u);
    setOpen(true);
  }
  async function onDelete(u: User) {
    if (!confirm(`Remove user "${u.name}"? They will lose access to the MCP gateway immediately.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Delete failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }
  async function onChangeRole(u: User, role: string) {
    if (role === u.role) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Role change failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }
  // Custom roles stack on top of the user's existing assignments. Same
  // endpoint the access-card uses; the kebab is just a quick-add path.
  async function onAddCustomRole(u: User, roleId: string) {
    const res = await fetch(`/api/users/${u.id}/role-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId, workspaceId: null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Assign failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  // Custom roles offered in the kebab quick-assign submenu — derived from
  // the all-roles list the page already sends down for bulk actions.
  const customRolesForQuickAdd = bulkAssignableRoles.filter((r) => !r.isSystem);
  const visibleRoles = ROLES.filter((r) => (roleCounts[r] ?? 0) > 0);

  return (
    <TooltipProvider delayDuration={150}>
      <PageHeader
        title="Users"
        description="People who can access this MCP Gateway instance and consume MCP servers."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a href="/api/users/export.csv" download>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
            <Button onClick={onInvite}>
              <Plus className="h-4 w-4" />
              Invite User
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-6">
        {visibleRoles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {visibleRoles.map((r, i) => (
              <span key={r} className="flex items-center gap-2">
                {i > 0 && <span className="text-border">·</span>}
                <Badge variant={badgeVariantFor(r)} className="text-[10px]">
                  {roleCounts[r]} {ROLE_LABEL[r]}
                  {roleCounts[r] === 1 ? "" : "s"}
                </Badge>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(viewerCanManageAssignments || viewerCanDelete) && selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span>
              <strong>{selectedIds.size}</strong> selected
            </span>
            <div className="flex items-center gap-2">
              {viewerCanManageAssignments && (
                <Button
                  size="sm"
                  onClick={() => setBulkDialogOpen(true)}
                  disabled={bulkAssignableRoles.length === 0}
                >
                  Assign role to {selectedIds.size}…
                </Button>
              )}
              {viewerCanDelete && viewerIsOwner && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete {selectedIds.size}…
                </Button>
              )}
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

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
                {viewerCanManageAssignments && (
                  <th className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={
                        filtered.length > 0 &&
                        filtered.every((u) => selectedIds.has(u.id))
                          ? true
                          : filtered.some((u) => selectedIds.has(u.id))
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        if (v === true) {
                          for (const u of filtered) next.add(u.id);
                        } else {
                          for (const u of filtered) next.delete(u.id);
                        }
                        setSelectedIds(next);
                      }}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Email" sortKey="email" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Role" sortKey="role" sort={sort} onToggle={toggleSort} />
                <SortHeader
                  label="Workspaces"
                  sortKey="workspaceCount"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="MCP Status"
                  sortKey="mcpStatus"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <th className="px-4 py-3 text-right font-medium">Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={viewerCanManageAssignments ? 7 : 6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No users match.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const isTargetOwner = u.role === "OWNER";
                // Can the viewer change this row's role?
                //   - must have users.change_role at all
                //   - if the target is Owner, must also be an Owner
                const canEditRow =
                  viewerCanChangeRole && (viewerIsOwner || !isTargetOwner);
                // Delete is Owner-only, and you can't delete yourself.
                const canDeleteRow =
                  viewerCanDelete && viewerIsOwner && u.id !== viewerId;
                const assignableRoles = ROLES.filter(
                  (r) => r !== "OWNER" || viewerIsOwner,
                );
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors hover:bg-muted/30",
                      u.suspended && "opacity-60",
                    )}
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(`/users/${u.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/users/${u.id}`);
                      }
                    }}
                  >
                    {viewerCanManageAssignments && (
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(u.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedIds);
                            if (v === true) next.add(u.id);
                            else next.delete(u.id);
                            setSelectedIds(next);
                          }}
                          aria-label={`Select ${u.name}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link
                        href={`/users/${u.id}`}
                        className="font-medium text-foreground hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {u.name}
                      </Link>
                      {u.suspended && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          <ShieldOff className="mr-1 h-3 w-3" />
                          Suspended
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleCell primary={u.role} allRoles={u.allRoles} />
                    </td>
                    <td className="px-4 py-3">
                      <WorkspacesCell
                        userId={u.id}
                        count={u.workspaceCount}
                        names={u.workspaceNames}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {u.mcpStatus === "active" ? (
                        <Badge variant="success">
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Quick actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onSelect={() => router.push(`/users/${u.id}`)}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={!canEditRow}>
                              <BadgeCheck className="h-4 w-4" />
                              Change role
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="w-60">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  System (replaces primary)
                                </DropdownMenuLabel>
                                {assignableRoles.map((r) => (
                                  <DropdownMenuItem
                                    key={r}
                                    onSelect={() => onChangeRole(u, r)}
                                    disabled={r === u.role}
                                  >
                                    <Badge
                                      variant={badgeVariantFor(r)}
                                      className="mr-2 text-[10px]"
                                    >
                                      {ROLE_LABEL[r]}
                                    </Badge>
                                    {r === u.role ? "current" : ""}
                                  </DropdownMenuItem>
                                ))}
                                {customRolesForQuickAdd.length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Custom (stacks on top)
                                    </DropdownMenuLabel>
                                    {customRolesForQuickAdd.map((cr) => {
                                      const alreadyAssigned = u.allRoles.some(
                                        (ar) => !ar.isSystem && ar.name === cr.name,
                                      );
                                      return (
                                        <DropdownMenuItem
                                          key={cr.id}
                                          onSelect={() =>
                                            !alreadyAssigned && onAddCustomRole(u, cr.id)
                                          }
                                          disabled={alreadyAssigned}
                                        >
                                          <Badge
                                            variant="outline"
                                            className="mr-2 text-[10px]"
                                          >
                                            {cr.name}
                                          </Badge>
                                          {alreadyAssigned ? "assigned" : ""}
                                        </DropdownMenuItem>
                                      );
                                    })}
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => router.push(`/users/${u.id}`)}
                                >
                                  <ShieldCheck className="h-4 w-4" />
                                  Manage all access…
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          {canDeleteRow && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => onDelete(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <UserFormDialog
        open={open}
        onOpenChange={setOpen}
        user={editing}
        viewerRole={viewerRole}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />

      <BulkAssignRoleDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        roles={bulkAssignableRoles}
        userIds={Array.from(selectedIds)}
        onSaved={(failedIds) => {
          setBulkDialogOpen(false);
          // Keep failures selected so the admin sees which rows didn't take.
          setSelectedIds(new Set(failedIds));
          startTransition(() => router.refresh());
        }}
      />

      <BulkDeleteDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        userIds={Array.from(selectedIds)}
        selfId={viewerId}
        onSaved={(failedIds) => {
          setBulkDeleteConfirmOpen(false);
          setSelectedIds(new Set(failedIds));
          startTransition(() => router.refresh());
        }}
      />
    </TooltipProvider>
  );
}

function BulkAssignRoleDialog({
  open,
  onOpenChange,
  roles,
  userIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: BulkRoleOption[];
  userIds: string[];
  onSaved: (failedIds: string[]) => void;
}) {
  const [roleId, setRoleId] = useState<string>(() => roles[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        succeeded: number;
        failed: number;
        failedDetails: { userId: string; error: string }[];
      }
  >(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId || userIds.length === 0) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/users/bulk-role-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, roleId, workspaceId: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? `Bulk assign failed (${res.status})`);
        return;
      }
      const failedDetails = (data.results as { userId: string; ok: boolean; error?: string }[])
        .filter((r) => !r.ok)
        .map((r) => ({ userId: r.userId, error: r.error ?? "" }));
      setResult({
        succeeded: data.succeeded as number,
        failed: data.failed as number,
        failedDetails,
      });
      onSaved(failedDetails.map((f) => f.userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const selectedRole = roles.find((r) => r.id === roleId);
  const behavior = selectedRole?.isSystem
    ? "Replaces each user's primary system role."
    : "Adds this custom role on top of each user's existing roles. Users already holding it are skipped.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign role to {userIds.length} user{userIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Pick any role (system or custom). System roles replace the user&apos;s primary role; custom roles stack on top.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="bulk-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.isSystem ? "" : "  (custom)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-muted-foreground">{behavior}</p>
            )}
          </div>
          {result && (
            <div className="rounded-md border border-border p-3 text-sm">
              <div>
                <span className="font-medium text-success">{result.succeeded} succeeded</span>
                {result.failed > 0 && (
                  <span className="ml-2 text-destructive">· {result.failed} failed</span>
                )}
              </div>
              {result.failedDetails.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {result.failedDetails.slice(0, 5).map((f) => (
                    <li key={f.userId}>
                      <code>{f.userId.slice(0, 8)}</code>: {f.error}
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
              <Button type="submit" disabled={!roleId || pending}>
                {pending ? "Assigning…" : `Assign role`}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  open,
  onOpenChange,
  userIds,
  selfId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userIds: string[];
  selfId: string;
  onSaved: (failedIds: string[]) => void;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        succeeded: number;
        failed: number;
        failedDetails: { userId: string; error: string }[];
      }
  >(null);

  // Filter out the caller — the API skips it anyway but we surface this in
  // the confirmation copy so it isn't a surprise.
  const deletable = userIds.filter((id) => id !== selfId);
  const selfIncluded = deletable.length !== userIds.length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/users/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? `Bulk delete failed (${res.status})`);
        return;
      }
      const failedDetails = (data.results as { userId: string; ok: boolean; error?: string }[])
        .filter((r) => !r.ok)
        .map((r) => ({ userId: r.userId, error: r.error ?? "" }));
      setResult({
        succeeded: data.succeeded as number,
        failed: data.failed as number,
        failedDetails,
      });
      onSaved(failedDetails.map((f) => f.userId));
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
            Delete {deletable.length} user{deletable.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Soft-deletes the selected users. They can no longer sign in or use MCP. This action is logged in the audit log.
            {selfIncluded && " You're in the selection — your own account will be skipped."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {result && (
            <div className="rounded-md border border-border p-3 text-sm">
              <div>
                <span className="font-medium text-success">{result.succeeded} deleted</span>
                {result.failed > 0 && (
                  <span className="ml-2 text-destructive">· {result.failed} failed</span>
                )}
              </div>
              {result.failedDetails.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {result.failedDetails.slice(0, 5).map((f) => (
                    <li key={f.userId}>
                      <code>{f.userId.slice(0, 8)}</code>: {f.error}
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
                disabled={deletable.length === 0 || pending}
              >
                {pending
                  ? "Deleting…"
                  : `Delete ${deletable.length} user${deletable.length === 1 ? "" : "s"}`}
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

function RoleCell({
  primary,
  allRoles,
}: {
  primary: string;
  allRoles: { name: string; isSystem: boolean; workspaceName: string | null }[];
}) {
  // The primary system role (Owner > Admin > etc.) is the headline. Extra
  // roles (additional system + every custom assignment) show as "+N" with a
  // tooltip listing each by name + scope.
  const extras = allRoles.filter((r) => {
    if (!r.isSystem) return true;
    // Multiple system roles are unusual but possible; drop only the one that
    // matches the primary slug. Compare by uppercased name as a quick proxy
    // — the seeded names are unique per slug.
    return r.name.toUpperCase() !== primary;
  });
  const primaryBadge = (
    <Badge variant={badgeVariantFor(primary)}>{labelFor(primary)}</Badge>
  );
  if (extras.length === 0) return primaryBadge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1.5">
          {primaryBadge}
          <Badge variant="outline" className="text-[10px]">
            +{extras.length}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="space-y-1 text-xs">
          <div className="font-medium">All roles</div>
          {allRoles.map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex items-center gap-1.5">
              <span>{r.name}</span>
              {r.workspaceName ? (
                <span className="text-muted-foreground">({r.workspaceName})</span>
              ) : null}
              {!r.isSystem && (
                <span className="text-[10px] text-muted-foreground">custom</span>
              )}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkspacesCell({
  userId,
  count,
  names,
}: {
  userId: string;
  count: number;
  names: string[];
}) {
  if (count === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const preview = names.slice(0, 3);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/users/${userId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          {count}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="space-y-1">
          {preview.map((n) => (
            <div key={n}>{n}</div>
          ))}
          {count > preview.length && (
            <div className="text-muted-foreground">+{count - preview.length} more</div>
          )}
          <Link
            href={`/users/${userId}`}
            onClick={(e) => e.stopPropagation()}
            className="block pt-1 text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
