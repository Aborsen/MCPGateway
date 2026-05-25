"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EFFECTIVE_LEVEL_LABEL,
  effectiveLevelsFor,
  type PermissionLevel,
} from "@/app/(dashboard)/permissions/permissions-types";

// Workspace memberships. Each row shows the workspace name + the user's
// SQL-level data permissions in that workspace (SELECT / INSERT / etc.) +
// a hover-revealed remove button. Connectors live in a sibling card now;
// this one stays focused on workspace membership.

type Workspace = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  permissions: string[];
};

export function UserWorkspacesCard({
  userId,
  workspaces,
  canRemove,
}: {
  userId: string;
  workspaces: Workspace[];
  canRemove: boolean;
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onRemove(w: Workspace) {
    if (
      !confirm(
        `Remove this user from "${w.workspaceName}"? They lose all connector access from this workspace.`,
      )
    ) {
      return;
    }
    setRemovingId(w.workspaceId);
    try {
      const res = await fetch(`/api/workspaces/${w.workspaceId}/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Remove failed (${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspaces</CardTitle>
        <CardDescription>
          Workspaces this user belongs to. Each grants MCP data permissions for the workspace&apos;s connectors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not assigned to any workspaces yet.{" "}
            <Link href="/workspaces" className="text-primary hover:underline">
              Go to workspaces
            </Link>{" "}
            to add this user.
          </p>
        ) : (
          <ul className="space-y-2">
            {workspaces.map((w) => (
              <li
                key={w.membershipId}
                className="group flex items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <Link
                  href={`/workspaces/${w.workspaceId}`}
                  className="font-medium hover:text-primary"
                >
                  {w.workspaceName}
                </Link>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {w.permissions.length === 0 ? (
                      <Badge variant="outline" className="text-[10px]">
                        no perms
                      </Badge>
                    ) : (
                      Array.from(
                        effectiveLevelsFor(w.permissions as PermissionLevel[]),
                      ).map((p) => (
                        <Badge key={p} variant="outline" className="text-xs uppercase">
                          {EFFECTIVE_LEVEL_LABEL[p]}
                        </Badge>
                      ))
                    )}
                  </div>
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(w)}
                      disabled={removingId === w.workspaceId}
                      aria-label={`Remove from ${w.workspaceName}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
