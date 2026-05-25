"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ShieldCheck, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function RolesView({
  initial,
  catalog,
  canManage,
}: {
  initial: Role[];
  catalog: PermissionEntry[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [filter, setFilter] = useState<"all" | "system" | "custom">("all");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (filter === "system") return initial.filter((r) => r.isSystem);
    if (filter === "custom") return initial.filter((r) => !r.isSystem);
    return initial;
  }, [initial, filter]);

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
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {systemCount} System
          </Badge>
          <span className="text-border">·</span>
          <Badge variant="outline" className="text-[10px]">
            {customCount} Custom
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterPill label="System" active={filter === "system"} onClick={() => setFilter("system")} />
          <FilterPill label="Custom" active={filter === "custom"} onClick={() => setFilter("custom")} />
          {canManage && (
            <Button onClick={onNew}>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {role.isSystem ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    )}
                    {role.name}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({role.slug})
                    </span>
                  </CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </div>
                <div className="flex shrink-0 gap-1">
                  {canManage && !role.isSystem && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(role)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(role)}
                        aria-label="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {role.isSystem && canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(role)}
                      aria-label="View"
                    >
                      <Pencil className="h-4 w-4 opacity-50" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {role.permissions.length === 0 ? (
                  <span className="text-muted-foreground">No permissions granted.</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">{role.permissions.length} permissions ·</span>
                    {summarizeCategories(role.permissions).map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Assigned to {role.assignmentCount} user{role.assignmentCount === 1 ? "" : "s"}.
              </div>
            </CardContent>
          </Card>
        ))}
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
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-2.5 py-1 text-xs transition-colors " +
        (active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted")
      }
    >
      {label}
    </button>
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
