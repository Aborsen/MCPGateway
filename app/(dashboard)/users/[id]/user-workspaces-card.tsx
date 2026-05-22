"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
type Workspace = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  permissions: string[];
  connectors: { id: string; name: string; slug: string }[];
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
    if (!confirm(`Remove this user from "${w.workspaceName}"? They lose all connector access from this workspace.`)) {
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
        <CardTitle>Workspaces &amp; connectors</CardTitle>
        <CardDescription>
          Workspaces this user belongs to and the connectors they get access to via each.
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
          <ul className="space-y-3">
            {workspaces.map((w) => (
              <li key={w.membershipId} className="group rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
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
                        w.permissions.map((p) => (
                          <Badge key={p} variant="outline" className="text-xs uppercase">
                            {p}
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
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {w.connectors.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No connectors in this workspace yet.</span>
                  ) : (
                    w.connectors.map((c) => (
                      <Link
                        key={c.id}
                        href={`/connections/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge variant="secondary" className="text-xs hover:bg-secondary/70">
                          {c.name}
                        </Badge>
                      </Link>
                    ))
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
