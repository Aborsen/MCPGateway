"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Lock,
  Download,
  AlertCircle,
  Search,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { RoleFormDialog } from "./role-form-dialog";

export type Role = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  assignmentCount: number;
};

export type PermissionEntry = {
  key: string;
  label: string;
  category: string;
  description: string;
  scopeable: boolean;
};

type SortKey = "name" | "type" | "permissionCount" | "assignmentCount";
type SortDir = "asc" | "desc";
type TypeFilter = "all" | "system" | "custom";

export function RolesView({
  initial,
  catalog,
  canManage,
  uncoveredPermissionKeys,
}: {
  initial: Role[];
  catalog: PermissionEntry[];
  canManage: boolean;
  uncoveredPermissionKeys: string[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "type",
    dir: "asc",
  });
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = initial.filter((r) => {
      if (typeFilter === "system" && !r.isSystem) return false;
      if (typeFilter === "custom" && r.isSystem) return false;
      if (q) {
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.slug.toLowerCase().includes(q) &&
          !r.description.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "type":
          // System first (false sorts after true for booleans, so invert)
          if (a.isSystem !== b.isSystem) return (a.isSystem ? -1 : 1) * dir;
          return a.name.localeCompare(b.name) * dir;
        case "permissionCount":
          return (a.permissions.length - b.permissions.length) * dir;
        case "assignmentCount":
          return (a.assignmentCount - b.assignmentCount) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return rows;
  }, [initial, search, typeFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function onNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(role: Role) {
    setEditing(role);
    setDialogOpen(true);
  }
  async function onDelete(role: Role) {
    if (role.isSystem) return;
    if (role.assignmentCount > 0) {
      alert(
        `${role.name} is assigned to ${role.assignmentCount} user(s). Unassign them first.`,
      );
      return;
    }
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Delete failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  const customCount = initial.filter((r) => !r.isSystem).length;
  const systemCount = initial.length - customCount;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4 p-6">
        {/* Catalog-coverage banner */}
        {uncoveredPermissionKeys.length > 0 && customCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="flex-1">
              <div className="font-medium">
                {uncoveredPermissionKeys.length} permission
                {uncoveredPermissionKeys.length === 1 ? "" : "s"} not granted by any custom role
              </div>
              <div className="text-xs text-muted-foreground">
                New permission keys are typically added during a release. System
                roles are reconciled automatically; review your custom roles and
                grant the new keys if they apply.
              </div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                  Show {uncoveredPermissionKeys.length > 12 ? "first 12" : "all"}
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {uncoveredPermissionKeys.slice(0, 12).map((k) => (
                    <code
                      key={k}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      {k}
                    </code>
                  ))}
                  {uncoveredPermissionKeys.length > 12 && (
                    <span className="text-muted-foreground">
                      +{uncoveredPermissionKeys.length - 12} more
                    </span>
                  )}
                </ul>
              </details>
            </div>
          </div>
        )}

        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {systemCount} System
          </Badge>
          <span className="text-border">·</span>
          <Badge variant="outline" className="text-[10px]">
            {customCount} Custom
          </Badge>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, slug, or description…"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <a href="/api/access/export.csv" download>
              <Download className="h-4 w-4" />
              Access CSV
            </a>
          </Button>
          {canManage && (
            <Button onClick={onNew}>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
                <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggleSort} />
                <SortHeader
                  label="Permissions"
                  sortKey="permissionCount"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Users"
                  sortKey="assignmentCount"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <th className="px-4 py-3 text-right font-medium">Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    {initial.length === 0
                      ? "No roles defined."
                      : "No roles match the current filter."}
                  </td>
                </tr>
              )}
              {filtered.map((role) => (
                <tr
                  key={role.id}
                  className={cn(
                    "cursor-pointer border-t border-border transition-colors hover:bg-muted/30",
                  )}
                  tabIndex={0}
                  role="button"
                  onClick={() => onEdit(role)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEdit(role);
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2 font-medium text-foreground">
                      {role.isSystem ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      )}
                      {role.name}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        ({role.slug})
                      </span>
                    </div>
                    {role.description && (
                      <div className="mt-0.5 line-clamp-2 max-w-2xl text-xs text-muted-foreground">
                        {role.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {role.isSystem ? (
                      <Badge variant="secondary" className="text-[10px]">
                        System
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Custom
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PermissionsCell perms={role.permissions} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {role.assignmentCount}
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
                      <DropdownMenuContent align="end" className="w-44">
                        {role.isSystem ? (
                          <DropdownMenuItem onSelect={() => onEdit(role)}>
                            <Eye className="h-4 w-4" />
                            View permissions
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem
                              onSelect={() => onEdit(role)}
                              disabled={!canManage}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => onDelete(role)}
                              disabled={!canManage}
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

        <RoleFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          role={editing}
          catalog={catalog}
          canManage={canManage}
          onSaved={() => {
            setDialogOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function PermissionsCell({ perms }: { perms: string[] }) {
  if (perms.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const categories = summarizeCategories(perms);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-2 text-muted-foreground">
          {perms.length}
          <span className="text-border">·</span>
          <span className="text-xs">{categories.length} categories</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <div className="space-y-1 text-xs">
          <div className="font-medium">{perms.length} permissions across</div>
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
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

function summarizeCategories(perms: string[]): string[] {
  const cats = new Set<string>();
  for (const p of perms) {
    const dot = p.indexOf(".");
    if (dot > 0) cats.add(p.slice(0, dot));
  }
  return Array.from(cats).sort();
}
