"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ShieldCheck,
  ShieldOff,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Assignment = {
  id: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  isSystemRole: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  grantedByName: string | null;
  grantedAt: string;
};

export type Override = {
  id: string;
  permissionKey: string;
  effect: "GRANT" | "REVOKE";
  reason: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  grantedByName: string | null;
  grantedAt: string;
  expiresAt: string | null;
};

export type EffectivePermission = {
  key: string;
  label: string;
  category: string;
  description: string;
  has: boolean;
  grantedBy: { roleName: string; workspaceName: string | null }[];
  overriddenBy:
    | {
        id: string;
        effect: "GRANT" | "REVOKE";
        reason: string | null;
        workspaceName: string | null;
        expiresAt: string | null;
      }
    | null;
};

export type RoleOption = { id: string; slug: string; name: string; isSystem: boolean };
export type WorkspaceOption = { id: string; name: string };
export type CatalogEntry = { key: string; label: string; category: string; scopeable: boolean };

// Radix Select disallows empty-string values. Sentinel for "no workspace".
const GLOBAL_SCOPE = "__global__";

// ─── Assigned Roles ───────────────────────────────────────────────────────

export function AssignedRolesCard({
  userId,
  canManage,
  assignments,
  roles,
  workspaces,
}: {
  userId: string;
  canManage: boolean;
  assignments: Assignment[];
  roles: RoleOption[];
  workspaces: WorkspaceOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function onRemove(a: Assignment) {
    if (
      !confirm(
        `Remove ${a.roleName}${a.workspaceName ? ` on ${a.workspaceName}` : ""}?`,
      )
    )
      return;
    const res = await fetch(`/api/users/${userId}/role-assignments/${a.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Remove failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Assigned roles</CardTitle>
            <CardDescription>
              Each row grants the user the permissions in that role, optionally limited to a workspace.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add role
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roles assigned.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.isSystemRole ? "default" : "outline"}>{a.roleName}</Badge>
                  {a.workspaceName ? (
                    <Badge variant="secondary" className="text-xs">
                      {a.workspaceName}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">global</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    added {new Date(a.grantedAt).toLocaleDateString()}
                    {a.grantedByName ? ` by ${a.grantedByName}` : ""}
                  </span>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(a)}
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AddRoleDialog
        userId={userId}
        open={open}
        onOpenChange={setOpen}
        roles={roles}
        workspaces={workspaces}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </Card>
  );
}

// ─── Permission Overrides ─────────────────────────────────────────────────

export function PermissionOverridesCard({
  userId,
  canManage,
  overrides,
  workspaces,
  catalog,
}: {
  userId: string;
  canManage: boolean;
  overrides: Override[];
  workspaces: WorkspaceOption[];
  catalog: CatalogEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function onRemove(o: Override) {
    if (!confirm(`Remove ${o.effect.toLowerCase()} of ${o.permissionKey}?`)) return;
    const res = await fetch(
      `/api/users/${userId}/permission-overrides/${o.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Remove failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Permission overrides</CardTitle>
            <CardDescription>
              One-off grants or revokes on top of roles. Use sparingly — these are the hardest to audit.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add override
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {overrides.length === 0 ? (
          <p className="text-sm text-muted-foreground">No overrides active.</p>
        ) : (
          <ul className="space-y-2">
            {overrides.map((o) => (
              <li
                key={o.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {o.effect === "GRANT" ? (
                      <Badge variant="success" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        GRANT
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldOff className="h-3 w-3" />
                        REVOKE
                      </Badge>
                    )}
                    <code className="font-mono text-xs">{o.permissionKey}</code>
                    {o.workspaceName && (
                      <Badge variant="secondary" className="text-xs">
                        {o.workspaceName}
                      </Badge>
                    )}
                  </div>
                  {o.reason && (
                    <p className="text-xs italic text-muted-foreground">“{o.reason}”</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    added {new Date(o.grantedAt).toLocaleDateString()}
                    {o.grantedByName ? ` by ${o.grantedByName}` : ""}
                    {o.expiresAt
                      ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(o)}
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AddOverrideDialog
        userId={userId}
        open={open}
        onOpenChange={setOpen}
        catalog={catalog}
        workspaces={workspaces}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </Card>
  );
}

// ─── Effective Permissions (collapsible) ──────────────────────────────────

export function EffectivePermissionsCard({
  effective,
  className,
}: {
  effective: EffectivePermission[];
  className?: string;
}) {
  const [filter, setFilter] = useState<"all" | "has" | "missing">("all");

  const filtered = useMemo(() => {
    if (filter === "has") return effective.filter((e) => e.has);
    if (filter === "missing") return effective.filter((e) => !e.has);
    return effective;
  }, [effective, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, EffectivePermission[]>();
    for (const e of filtered) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const hasCount = effective.filter((e) => e.has).length;
  const totalCount = effective.length;

  return (
    <Card className={className}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-6 hover:bg-muted/20">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              Effective permissions
              <span className="text-xs font-normal text-muted-foreground">
                {hasCount} / {totalCount} granted
              </span>
            </CardTitle>
            <CardDescription className="mt-1 ml-6">
              Every permission in the catalog plus the path it came from. Use this to debug “is it the role or the override?”
            </CardDescription>
          </div>
        </summary>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-1 text-xs">
            <FilterPill
              label="All"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterPill
              label="Has"
              active={filter === "has"}
              onClick={() => setFilter("has")}
            />
            <FilterPill
              label="Missing"
              active={filter === "missing"}
              onClick={() => setFilter("missing")}
            />
          </div>

          {grouped.map(([category, perms]) => (
            <div key={category} className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {category}
              </div>
              <ul className="space-y-1">
                {perms.map((p) => (
                  <li
                    key={p.key}
                    className="flex items-start justify-between gap-3 rounded-sm py-1 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.has ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                        <code className="font-mono text-xs">{p.key}</code>
                        {p.overriddenBy && (
                          <Badge
                            variant={
                              p.overriddenBy.effect === "GRANT" ? "success" : "destructive"
                            }
                            className="text-[10px]"
                          >
                            override {p.overriddenBy.effect}
                          </Badge>
                        )}
                      </div>
                      <div className="ml-5 text-xs text-muted-foreground">
                        {provenanceText(p)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </details>
    </Card>
  );
}

// ─── Convenience wrapper: the 3 cards in a 2-col grid for /users/[id]/access ──

export function UserAccessView({
  userId,
  canManageAssignments,
  canManageOverrides,
  assignments,
  overrides,
  effective,
  roles,
  workspaces,
  catalog,
}: {
  userId: string;
  canManageAssignments: boolean;
  canManageOverrides: boolean;
  assignments: Assignment[];
  overrides: Override[];
  effective: EffectivePermission[];
  roles: RoleOption[];
  workspaces: WorkspaceOption[];
  catalog: CatalogEntry[];
}) {
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      <AssignedRolesCard
        userId={userId}
        canManage={canManageAssignments}
        assignments={assignments}
        roles={roles}
        workspaces={workspaces}
      />
      <PermissionOverridesCard
        userId={userId}
        canManage={canManageOverrides}
        overrides={overrides}
        workspaces={workspaces}
        catalog={catalog}
      />
      <EffectivePermissionsCard effective={effective} className="lg:col-span-2" />
    </div>
  );
}

// ─── Internals ────────────────────────────────────────────────────────────

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
      className={cn(
        "rounded-md border px-2 py-0.5 transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function provenanceText(p: EffectivePermission): string {
  const parts: string[] = [];
  if (p.grantedBy.length > 0) {
    const scopes = p.grantedBy.map((g) =>
      g.workspaceName ? `${g.roleName} (${g.workspaceName})` : g.roleName,
    );
    parts.push(`granted by: ${scopes.join(", ")}`);
  }
  if (p.overriddenBy) {
    parts.push(
      `override ${p.overriddenBy.effect}${p.overriddenBy.reason ? ` — "${p.overriddenBy.reason}"` : ""}`,
    );
  }
  if (parts.length === 0) {
    return "not granted by any role; no override.";
  }
  return parts.join(" · ");
}

function AddRoleDialog({
  userId,
  open,
  onOpenChange,
  roles,
  workspaces,
  onSaved,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: RoleOption[];
  workspaces: WorkspaceOption[];
  onSaved: () => void;
}) {
  const [roleId, setRoleId] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string>(GLOBAL_SCOPE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/role-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          workspaceId: workspaceId === GLOBAL_SCOPE ? null : workspaceId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      onSaved();
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
          <DialogTitle>Assign role</DialogTitle>
          <DialogDescription>
            Pick a role and optionally limit it to a single workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-role-id">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="add-role-id">
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.isSystem ? "" : " (custom)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-role-ws">Workspace scope (optional)</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger id="add-role-ws">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL_SCOPE}>Global (no workspace)</SelectItem>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When scoped, this role&apos;s powers apply only within that workspace.
            </p>
          </div>
          {error && (
            <p className="flex items-start gap-1 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!roleId || pending}>
              {pending ? "Assigning…" : "Assign role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddOverrideDialog({
  userId,
  open,
  onOpenChange,
  catalog,
  workspaces,
  onSaved,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  catalog: CatalogEntry[];
  workspaces: WorkspaceOption[];
  onSaved: () => void;
}) {
  const [permissionKey, setPermissionKey] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string>(GLOBAL_SCOPE);
  const [effect, setEffect] = useState<"GRANT" | "REVOKE">("GRANT");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEntry = catalog.find((c) => c.key === permissionKey);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/permission-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionKey,
          workspaceId: workspaceId === GLOBAL_SCOPE ? null : workspaceId,
          effect,
          reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setPermissionKey("");
      setWorkspaceId(GLOBAL_SCOPE);
      setReason("");
      setEffect("GRANT");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const c of catalog) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add permission override</DialogTitle>
          <DialogDescription>
            Grants or revokes a single permission on top of the user&apos;s role assignments.
            A reason is required so the audit trail explains the exception.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ov-effect">Effect</Label>
              <Select value={effect} onValueChange={(v) => setEffect(v as "GRANT" | "REVOKE")}>
                <SelectTrigger id="ov-effect">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GRANT">GRANT — give this permission</SelectItem>
                  <SelectItem value="REVOKE">REVOKE — take it away</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ov-ws">Workspace scope (optional)</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId} disabled={!selectedEntry?.scopeable}>
                <SelectTrigger id="ov-ws">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_SCOPE}>Global</SelectItem>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedEntry?.scopeable && permissionKey && (
                <p className="text-xs text-muted-foreground">
                  This permission isn&apos;t scopeable; the override applies globally.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ov-perm">Permission</Label>
            <Select value={permissionKey} onValueChange={setPermissionKey}>
              <SelectTrigger id="ov-perm">
                <SelectValue placeholder="Pick a permission" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([category, perms]) => (
                  <div key={category}>
                    <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {category}
                    </div>
                    {perms.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        <span className="font-mono text-xs">{p.key}</span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ov-reason">Reason (required)</Label>
            <Input
              id="ov-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. on-call for the week ending 2026-06-01"
              required
              maxLength={500}
            />
          </div>

          {error && (
            <p className="flex items-start gap-1 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!permissionKey || !reason || pending}>
              {pending ? "Saving…" : `Add ${effect.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
