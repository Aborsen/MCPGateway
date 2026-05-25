"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserMcpUrl } from "./user-mcp-url";
import { cn } from "@/lib/utils";

// Account card. Role management was moved out — it lives in the
// "Assigned roles" card below, which handles system + custom + scoped
// roles in one place instead of duplicating a simple system-role select
// here. The MCP connection URL was folded in (used to be a standalone
// card).
export function UserAccountCard({
  userId,
  email,
  createdAt,
  suspended,
  mcpUrl,
  viewerIsOwner,
  viewerCanSuspend,
  isSelf,
}: {
  userId: string;
  email: string;
  createdAt: string;
  suspended: boolean;
  mcpUrl: string;
  viewerIsOwner: boolean;
  viewerCanSuspend: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [currentSuspended, setCurrentSuspended] = useState(suspended);
  const [pending, startTransition] = useTransition();

  // You can't suspend your own account. Touching an Owner requires Owner.
  // (We don't know the target's role here anymore — the page passes
  // viewerIsOwner so we can gate by viewer level; suspend on a non-Owner
  // requires only viewerCanSuspend.)
  const canSuspend = viewerCanSuspend && !isSelf && viewerIsOwner;

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
        <CardDescription>
          Email, account state, and this user&apos;s MCP connection URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Email</span>
          <span>{email}</span>
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
            You can&apos;t suspend your own account. Ask another admin.
          </p>
        )}

        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            MCP connection URL
          </div>
          <UserMcpUrl url={mcpUrl} />
        </div>
      </CardContent>
    </Card>
  );
}
