"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, ROLE_LABEL, badgeVariantFor, canEdit, labelFor } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export function UserAccountCard({
  userId,
  email,
  role,
  createdAt,
  suspended,
  viewerRole,
  isSelf,
}: {
  userId: string;
  email: string;
  role: string;
  createdAt: string;
  suspended: boolean;
  viewerRole: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState(role);
  const [currentSuspended, setCurrentSuspended] = useState(suspended);
  const [pending, startTransition] = useTransition();

  const editable = canEdit(viewerRole, "users") && !isSelf;
  const isViewerOwner = viewerRole === "OWNER";
  const isTargetOwner = currentRole === "OWNER";
  const canChangeRole = editable && (isViewerOwner || !isTargetOwner);
  const canSuspend = editable && (isViewerOwner || !isTargetOwner);
  const assignableRoles = ROLES.filter((r) => r !== "OWNER" || isViewerOwner);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Update failed (${res.status})`);
      return false;
    }
    return true;
  }

  async function onRoleChange(next: string) {
    if (next === currentRole) return;
    const prev = currentRole;
    setCurrentRole(next);
    const ok = await patch({ role: next });
    if (!ok) setCurrentRole(prev);
    else startTransition(() => router.refresh());
  }

  async function onSuspendToggle(next: boolean) {
    const prev = currentSuspended;
    setCurrentSuspended(next);
    const ok = await patch({ suspended: next });
    if (!ok) setCurrentSuspended(prev);
    else startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Email, role, and account state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Email</span>
          <span>{email}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Role</span>
          {canChangeRole ? (
            <Select value={currentRole} onValueChange={onRoleChange} disabled={pending}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant={badgeVariantFor(currentRole)}>{labelFor(currentRole)}</Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Suspended</span>
            <span className="text-xs text-muted-foreground/80">
              Blocks dashboard sign-in and MCP usage.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={currentSuspended}
            disabled={!canSuspend || pending}
            onClick={() => onSuspendToggle(!currentSuspended)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              currentSuspended ? "bg-destructive" : "bg-input",
              (!canSuspend || pending) && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition-transform",
                currentSuspended ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Created</span>
          <span>{new Date(createdAt).toLocaleDateString()}</span>
        </div>
        {isSelf && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            You can&apos;t change your own role or suspension state. Ask another admin.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
