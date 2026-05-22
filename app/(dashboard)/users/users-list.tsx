"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Search,
  ChevronUp,
  ChevronDown,
  Download,
  ShieldOff,
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

export function UsersList({
  initial,
  viewerRole,
  viewerId,
  roleCounts,
}: {
  initial: User[];
  viewerRole: string;
  viewerId: string;
  roleCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [, startTransition] = useTransition();

  const isOwner = viewerRole === "OWNER";

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

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
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
                <th className="w-12 px-4 py-3"></th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No users match.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const isTargetOwner = u.role === "OWNER";
                const canEdit = isOwner || !isTargetOwner;
                const canDelete = isOwner && u.id !== viewerId;
                const assignableRoles = ROLES.filter(
                  (r) => r !== "OWNER" || isOwner,
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
                      <Badge variant={badgeVariantFor(u.role)}>{labelFor(u.role)}</Badge>
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
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/users/${u.id}`)}
                          aria-label="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
                          <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={!canEdit}>
                              <Pencil className="h-4 w-4" />
                              Change role
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="w-44">
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
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          {canDelete && (
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
    </TooltipProvider>
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
          "inline-flex items-center gap-1 hover:text-foreground",
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
