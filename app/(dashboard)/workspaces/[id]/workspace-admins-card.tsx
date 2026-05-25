"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ShieldCheck, AlertCircle } from "lucide-react";
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
import { Label } from "@/components/ui/label";

// Workspace-scoped role assignments. Distinct from the WorkspaceUser
// membership editor below — that controls MCP *data* permissions
// (select/insert/update/delete/execute) for tool calls. This card controls
// who can administer the workspace itself: rename it, add/remove members,
// attach/detach connectors, etc.

type Assignment = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  grantedAt: string;
  grantedByName: string | null;
};

type UserOption = { id: string; name: string; email: string };

export function WorkspaceAdminsCard({
  workspaceId,
  workspaceName,
  canManage,
  canViewUsers,
  workspaceAdminRoleId,
  workspaceMemberRoleId,
  allUsers,
  assignments,
}: {
  workspaceId: string;
  workspaceName: string;
  canManage: boolean;
  canViewUsers: boolean;
  workspaceAdminRoleId: string | null;
  workspaceMemberRoleId: string | null;
  allUsers: UserOption[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function onRemove(a: Assignment) {
    if (
      !confirm(
        `Remove ${a.roleName} role from ${a.userName} on workspace "${workspaceName}"?`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/users/${a.userId}/role-assignments/${a.id}`,
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Workspace roles</CardTitle>
            <CardDescription>
              Workspace-scoped role assignments. A <strong>Workspace Admin</strong> can manage members,
              connectors, and settings of this workspace only. A <strong>Workspace Member</strong> gets
              read access scoped to this workspace. These are separate from the MCP data permissions
              below.
            </CardDescription>
          </div>
          {canManage && (workspaceAdminRoleId || workspaceMemberRoleId) && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workspace-scoped roles assigned yet. Global Owners and Admins always have access regardless.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {canViewUsers ? (
                    <Link
                      href={`/users/${a.userId}`}
                      className="font-medium hover:text-primary"
                    >
                      {a.userName}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.userName}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{a.userEmail}</span>
                  <Badge
                    variant={a.roleSlug === "workspace_admin" ? "default" : "secondary"}
                    className="gap-1"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {a.roleName}
                  </Badge>
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
      <AddDialog
        workspaceId={workspaceId}
        open={open}
        onOpenChange={setOpen}
        workspaceAdminRoleId={workspaceAdminRoleId}
        workspaceMemberRoleId={workspaceMemberRoleId}
        allUsers={allUsers}
        existing={assignments}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </Card>
  );
}

function AddDialog({
  workspaceId,
  open,
  onOpenChange,
  workspaceAdminRoleId,
  workspaceMemberRoleId,
  allUsers,
  existing,
  onSaved,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceAdminRoleId: string | null;
  workspaceMemberRoleId: string | null;
  allUsers: UserOption[];
  existing: Assignment[];
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>(
    workspaceAdminRoleId ?? workspaceMemberRoleId ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users who already have ANY workspace-scoped role here go to the bottom
  // of the list so it's easy to spot new candidates first.
  const sortedUsers = useMemo(() => {
    const taken = new Set(existing.map((e) => e.userId));
    return [...allUsers].sort((a, b) => {
      const at = taken.has(a.id) ? 1 : 0;
      const bt = taken.has(b.id) ? 1 : 0;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }, [allUsers, existing]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/role-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, workspaceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setUserId("");
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
          <DialogTitle>Assign workspace role</DialogTitle>
          <DialogDescription>
            Grants the picked user this role scoped only to this workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-add-user">User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="ws-add-user">
                <SelectValue placeholder="Pick a user" />
              </SelectTrigger>
              <SelectContent>
                {sortedUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} — {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-add-role">Workspace role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="ws-add-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspaceAdminRoleId && (
                  <SelectItem value={workspaceAdminRoleId}>
                    Workspace Admin — manage members, connectors, settings
                  </SelectItem>
                )}
                {workspaceMemberRoleId && (
                  <SelectItem value={workspaceMemberRoleId}>
                    Workspace Member — view this workspace
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={!userId || !roleId || pending}>
              {pending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
